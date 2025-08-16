import pytest
import tempfile
import time
import os
from unittest.mock import Mock, patch, MagicMock
from flask import Flask
from visivo.server.hot_reload_server import HotReloadServer, ProjectChangeHandler
from threading import Thread


class TestHotReloadServer:
    """Test suite for HotReloadServer pause/resume functionality"""

    def test_hot_reload_server_initialization(self):
        """Test HotReloadServer initializes correctly"""
        app = Flask(__name__)
        on_project_change = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            server = HotReloadServer(
                app=app,
                on_project_change=on_project_change,
                watch_path=tmpdir,
                ignore_patterns=["*.pyc"],
            )

            assert server.app == app
            assert server.watch_path == tmpdir
            assert server.ignore_patterns == ["*.pyc"]
            assert server.on_project_change == on_project_change
            assert server.observer is None
            assert server.pause_lock is not None

    def test_pause_file_watcher(self):
        """Test that pause_file_watcher acquires the lock"""
        app = Flask(__name__)
        on_project_change = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            server = HotReloadServer(
                app=app, on_project_change=on_project_change, watch_path=tmpdir
            )

            # Initially lock should be available
            assert server.pause_lock.acquire(blocking=False)
            server.pause_lock.release()

            # Pause the file watcher
            server.pause_file_watcher()

            # Lock should now be held
            assert not server.pause_lock.acquire(blocking=False)

            # Resume the file watcher
            server.resume_file_watcher()

            # Lock should be available again
            assert server.pause_lock.acquire(blocking=False)
            server.pause_lock.release()

    def test_resume_file_watcher(self):
        """Test that resume_file_watcher releases the lock"""
        app = Flask(__name__)
        on_project_change = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            server = HotReloadServer(
                app=app, on_project_change=on_project_change, watch_path=tmpdir
            )

            # Pause and then resume
            server.pause_file_watcher()
            server.resume_file_watcher()

            # Lock should be available
            assert server.pause_lock.acquire(blocking=False)
            server.pause_lock.release()

            # Calling resume without pause should not error
            server.resume_file_watcher()  # Should handle RuntimeError gracefully

    def test_file_watcher_respects_pause(self):
        """Test that file watcher ignores changes when paused"""
        callback = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            app = Flask(__name__)
            on_project_change = Mock()
            server = HotReloadServer(
                app=app, on_project_change=on_project_change, watch_path=tmpdir
            )

            # Create a ProjectChangeHandler with the server's pause lock
            handler = ProjectChangeHandler(
                callback=callback, ignore_patterns=[], pause_lock=server.pause_lock
            )

            # Create a mock event for a YAML file
            event = Mock()
            event.is_directory = False
            event.src_path = os.path.join(tmpdir, "test.yml")

            # Without pause, callback should be called
            handler.on_modified(event)
            time.sleep(0.1)  # Wait for debounce
            callback.assert_called_once()
            callback.reset_mock()

            # Pause the file watcher
            server.pause_file_watcher()

            # Now callback should not be called
            handler.on_modified(event)
            time.sleep(0.1)  # Wait to ensure no call happens
            callback.assert_not_called()

            # Resume the file watcher
            server.resume_file_watcher()

            # Reset last_event_time to avoid debounce
            handler.last_event_time = 0

            # Now callback should be called again
            handler.on_modified(event)
            time.sleep(0.1)  # Wait for debounce
            callback.assert_called_once()

    def test_pause_resume_during_cloning_scenario(self):
        """Test the real-world scenario of pausing during project cloning"""
        app = Flask(__name__)
        on_project_change = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            server = HotReloadServer(
                app=app, on_project_change=on_project_change, watch_path=tmpdir
            )

            # Simulate the cloning workflow

            # 1. Pause before cloning starts
            server.pause_file_watcher()

            # 2. Simulate file creation during cloning (would normally trigger watcher)
            test_file = os.path.join(tmpdir, "project.visivo.yml")
            with open(test_file, "w") as f:
                f.write("name: test_project\n")

            # Create a handler to test
            handler = ProjectChangeHandler(
                callback=on_project_change, ignore_patterns=[], pause_lock=server.pause_lock
            )

            # 3. Try to trigger the handler (should be ignored due to pause)
            event = Mock()
            event.is_directory = False
            event.src_path = test_file

            handler.on_modified(event)
            time.sleep(0.1)

            # Callback should not have been called because we're paused
            on_project_change.assert_not_called()

            # 4. Resume after cloning is complete
            server.resume_file_watcher()

            # 5. Now file changes should trigger the callback
            handler.last_event_time = 0  # Reset debounce
            handler.on_modified(event)
            time.sleep(0.1)

            # Callback should now be called
            on_project_change.assert_called_once()

    def test_concurrent_pause_resume(self):
        """Test that pause/resume works correctly with concurrent access"""
        app = Flask(__name__)
        on_project_change = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            server = HotReloadServer(
                app=app, on_project_change=on_project_change, watch_path=tmpdir
            )

            results = []

            def pause_thread():
                server.pause_file_watcher()
                results.append("paused")
                time.sleep(0.1)  # Hold the lock briefly
                server.resume_file_watcher()
                results.append("resumed")

            def check_thread():
                time.sleep(0.05)  # Let pause happen first
                # Try to acquire lock - should fail while paused
                acquired = server.pause_lock.acquire(blocking=False)
                results.append(f"acquired: {acquired}")
                if acquired:
                    server.pause_lock.release()

            # Run threads
            t1 = Thread(target=pause_thread)
            t2 = Thread(target=check_thread)

            t1.start()
            t2.start()

            t1.join()
            t2.join()

            # Check results
            assert "paused" in results
            assert "resumed" in results
            assert "acquired: False" in results  # Lock was held during pause

    @patch("visivo.server.hot_reload_server.Observer")
    def test_start_file_watcher_with_pause(self, mock_observer_class):
        """Test that file watcher can be started and respects pause state"""
        mock_observer = Mock()
        mock_observer_class.return_value = mock_observer

        app = Flask(__name__)
        on_project_change = Mock()

        with tempfile.TemporaryDirectory() as tmpdir:
            server = HotReloadServer(
                app=app, on_project_change=on_project_change, watch_path=tmpdir
            )

            # Mock socketio to avoid real socket operations
            server.socketio = Mock()

            # Start the file watcher
            def wrapped_callback():
                on_project_change(one_shot=False)
                server.socketio.emit("reload")

            server.start_file_watcher(wrapped_callback, one_shot=False)

            # Observer should be started
            mock_observer.start.assert_called_once()

            # Verify the handler was registered with the pause lock
            schedule_call = mock_observer.schedule.call_args
            handler = schedule_call[0][0]
            assert isinstance(handler, ProjectChangeHandler)
            assert handler.pause_lock == server.pause_lock
