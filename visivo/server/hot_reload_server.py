from flask import Flask
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from threading import Thread, Event, Lock
import time
from visivo.logger.logger import Logger
import os
from flask_socketio import SocketIO
import logging
import socket


class ProjectChangeHandler(FileSystemEventHandler):
    def __init__(self, callback, ignore_patterns=None, pause_lock=None):
        self.callback = callback
        self.ignore_patterns = ignore_patterns or []
        self.last_event_time = 0
        self.debounce_seconds = 0.5  # Debounce events within 500ms
        self.pause_lock = pause_lock or Lock()

    def on_modified(self, event):
        if event.is_directory:
            return

        # Only process .yml files
        if not (event.src_path.endswith(".yml") or event.src_path.endswith(".yaml")):
            return

        # Check if file should be ignored
        if any(pattern in event.src_path for pattern in self.ignore_patterns):
            return

        # Check if we're paused (e.g., during cloning)
        if not self.pause_lock.acquire(blocking=False):
            Logger.instance().debug(f"File watcher paused, ignoring change: {event.src_path}")
            return

        try:
            current_time = time.time()
            if current_time - self.last_event_time > self.debounce_seconds:
                Logger.instance().debug(f"Triggering file modified: {event.src_path}")
                self.last_event_time = current_time
                self.callback()
        finally:
            self.pause_lock.release()


class HotReloadServer:
    @staticmethod
    def find_available_port(start_port=8000, max_attempts=100):
        """Find an available port starting from start_port"""
        for port in range(start_port, start_port + max_attempts):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(("", port))
                    return port
            except OSError:
                continue
        raise RuntimeError(f"Could not find an available port after {max_attempts} attempts")

    def __init__(self, app: Flask, on_project_change, watch_path: str, ignore_patterns=None):
        self.app = app
        self.watch_path = watch_path
        self.ignore_patterns = ignore_patterns or []
        self.observer = None
        self.server_thread = None
        self.on_project_change = on_project_change
        self.stop_event = Event()
        self.socketio = SocketIO(self.app, cors_allowed_origins="*", async_mode="threading")
        self.pause_lock = Lock()  # Lock for pausing file watcher during operations

        if not os.environ.get("DEBUG"):
            # Suppress Flask logging
            log = logging.getLogger("werkzeug")
            log.setLevel(logging.ERROR)

            # Suppress Flask-SocketIO logging
            log = logging.getLogger("engineio")
            log.setLevel(logging.ERROR)
            log = logging.getLogger("socketio")
            log.setLevel(logging.ERROR)

    def start_file_watcher(self, callback, one_shot=False):
        """Start watching for file changes"""

        def wrapped_callback():
            # Pass one_shot context to the callback
            callback(one_shot=one_shot)
            # Notify clients to refresh after callback completes
            self.socketio.emit("reload")

        event_handler = ProjectChangeHandler(
            wrapped_callback, self.ignore_patterns, self.pause_lock
        )
        self.observer = Observer()
        self.observer.schedule(event_handler, self.watch_path, recursive=True)
        self.observer.start()
        Logger.instance().debug(f"Started file watcher for YML files on {self.watch_path}")

    def pause_file_watcher(self):
        """Pause the file watcher (e.g., during cloning operations)"""
        Logger.instance().debug("Pausing file watcher")
        self.pause_lock.acquire()

    def resume_file_watcher(self):
        """Resume the file watcher after pausing"""
        Logger.instance().debug("Resuming file watcher")
        try:
            self.pause_lock.release()
        except RuntimeError:
            # Lock was not acquired, ignore
            pass

    def run_server(self, host: str, port: int):
        """Run the Flask server in a separate thread"""

        def run():
            self.socketio.run(
                self.app,
                host=host,
                port=port,
                use_reloader=False,
                allow_unsafe_werkzeug=True,
                debug=bool(os.environ.get("DEBUG")),
                log_output=bool(os.environ.get("DEBUG")),
            )

        self.server_thread = Thread(target=run, daemon=True)
        self.server_thread.start()
        Logger.instance().debug(f"Started server on {host}:{port}")

    def serve(
        self,
        host: str,
        port: int,
        on_change_callback=None,
        on_server_ready=None,
        one_shot=False,
    ):
        """Start both the server and file watcher

        Args:
            host: Host to bind to
            port: Port to listen on
            on_change_callback: Callback for file changes
            on_server_ready: Callback to run after server starts
            one_shot: If True, server will shut down after on_server_ready callback completes
        """
        try:
            # Add route for client-side reload script
            @self.app.route("/hot-reload.js")
            def hot_reload_script():
                return """
                    const socket = io();
                    socket.on('reload', () => {
                        console.log('Reloading page...');
                        window.location.reload();
                    });
                """, {
                    "Content-Type": "application/javascript"
                }

            # Start the Flask server
            self.run_server(host, port)

            # Run initialization callback if provided
            if on_server_ready:
                # Pass one_shot context to the callback
                on_server_ready(one_shot=one_shot)
                if one_shot:
                    self.stop()
                    return

            # Start the file watcher if callback provided and not in one_shot mode
            if on_change_callback and not one_shot:
                self.start_file_watcher(on_change_callback, one_shot=one_shot)

            # Keep the main thread alive if not in one_shot mode
            while not one_shot and not self.stop_event.is_set():
                time.sleep(1)

        except KeyboardInterrupt:
            self.stop()

        except Exception as e:
            Logger.instance().error(f"Server error: {str(e)}")
            self.stop()
            raise

    def stop(self):
        """Stop the server and file watcher"""
        if self.observer:
            self.observer.stop()
            self.observer.join()

        self.stop_event.set()

        if self.server_thread:
            # Flask's development server doesn't handle clean shutdowns well
            # We'll let it be terminated when the main process exits
            pass

        Logger.instance().debug("Stopped server and file watcher")
