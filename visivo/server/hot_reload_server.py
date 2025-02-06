from flask import Flask
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent
from threading import Thread, Event
import time
from visivo.logging.logger import Logger
import os
from flask_socketio import SocketIO

class ProjectChangeHandler(FileSystemEventHandler):
    def __init__(self, callback, ignore_patterns=None):
        self.callback = callback
        self.ignore_patterns = ignore_patterns or []
        self.last_event_time = 0
        self.debounce_seconds = 0.5  # Debounce events within 500ms

    def on_modified(self, event):
        if event.is_directory:
            return
            
        # Only process .yml files
        if not (event.src_path.endswith('.yml') or event.src_path.endswith('.yaml')):
            return
            
        # Check if file should be ignored
        if any(pattern in event.src_path for pattern in self.ignore_patterns):
            return

        current_time = time.time()
        if current_time - self.last_event_time > self.debounce_seconds:
            self.last_event_time = current_time
            self.callback()

class HotReloadServer:
    def __init__(self, app: Flask, watch_path: str, ignore_patterns=None):
        self.app = app
        self.watch_path = watch_path
        self.ignore_patterns = ignore_patterns or []
        self.observer = None
        self.server_thread = None
        self.stop_event = Event()
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")

    def start_file_watcher(self, callback):
        """Start watching for file changes"""
        def wrapped_callback():
            callback()
            # Notify clients to refresh after callback completes
            self.socketio.emit('reload')
            
        event_handler = ProjectChangeHandler(wrapped_callback, self.ignore_patterns)
        self.observer = Observer()
        self.observer.schedule(event_handler, self.watch_path, recursive=True)
        self.observer.start()
        Logger.instance().debug(f"Started file watcher for YML files on {self.watch_path}")

    def run_server(self, host: str, port: int):
        """Run the Flask server in a separate thread"""
        def run():
            self.socketio.run(self.app, host=host, port=port, use_reloader=False, allow_unsafe_werkzeug=True)

        self.server_thread = Thread(target=run, daemon=True)
        self.server_thread.start()
        Logger.instance().debug(f"Started server on {host}:{port}")

    def serve(self, host: str, port: int, on_change_callback=None, on_server_ready=None):
        """Start both the server and file watcher"""
        try:
            # Add route for client-side reload script
            @self.app.route('/hot-reload.js')
            def hot_reload_script():
                return """
                    const socket = io();
                    socket.on('reload', () => {
                        console.log('Reloading page...');
                        window.location.reload();
                    });
                """, {'Content-Type': 'application/javascript'}
            
            # Start the Flask server
            self.run_server(host, port)
            
            # Run initialization callback if provided
            if on_server_ready:
                on_server_ready()
            
            # Start the file watcher if callback provided
            if on_change_callback:
                self.start_file_watcher(on_change_callback)
            
            # Keep the main thread alive
            while not self.stop_event.is_set():
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
