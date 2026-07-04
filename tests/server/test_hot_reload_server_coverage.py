"""Coverage-focused behavioral tests for HotReloadServer / ProjectChangeHandler.

Targets the branches the primary suite leaves uncovered: the event-filtering
short circuits, find_available_port exhaustion, the wrapped callback emitted by
start_file_watcher, run_server, the serve() lifecycle (one-shot, watch loop, and
error path), and stop().
"""

import time
from threading import Thread
from unittest.mock import Mock, patch

import pytest
from flask import Flask

from visivo.server.hot_reload_server import HotReloadServer, ProjectChangeHandler


def _server(tmp_path):
    return HotReloadServer(
        app=Flask(__name__.replace(".", "_") + str(time.time_ns())),
        on_project_change=Mock(),
        watch_path=str(tmp_path),
    )


class TestProjectChangeHandlerFilters:
    def test_directory_events_ignored(self):
        callback = Mock()
        handler = ProjectChangeHandler(callback)
        event = Mock(is_directory=True, src_path="/x/whatever.yml")
        handler.on_modified(event)
        callback.assert_not_called()

    def test_non_yaml_files_ignored(self):
        callback = Mock()
        handler = ProjectChangeHandler(callback)
        event = Mock(is_directory=False, src_path="/x/notes.txt")
        handler.on_modified(event)
        callback.assert_not_called()

    def test_ignored_patterns_skip_callback(self):
        callback = Mock()
        handler = ProjectChangeHandler(callback, ignore_patterns=["target/"])
        event = Mock(is_directory=False, src_path="/proj/target/dbt.yml")
        handler.on_modified(event)
        callback.assert_not_called()

    def test_yaml_extension_also_triggers(self):
        callback = Mock()
        handler = ProjectChangeHandler(callback)
        event = Mock(is_directory=False, src_path="/proj/project.yaml")
        handler.on_modified(event)
        callback.assert_called_once()


class TestFindAvailablePort:
    def test_returns_a_bindable_port(self):
        port = HotReloadServer.find_available_port(start_port=8100, max_attempts=50)
        assert 8100 <= port < 8150

    def test_raises_when_no_ports_available(self):
        # max_attempts=0 → the search range is empty → RuntimeError.
        with pytest.raises(RuntimeError, match="Could not find an available port"):
            HotReloadServer.find_available_port(start_port=8000, max_attempts=0)


class TestStartFileWatcher:
    @patch("visivo.server.hot_reload_server.Observer")
    def test_wrapped_callback_invokes_callback_and_emits_reload(self, mock_observer_cls, tmp_path):
        server = _server(tmp_path)
        server.socketio = Mock()
        inner = Mock()

        server.start_file_watcher(inner, one_shot=True)

        # Pull the wrapped callback the handler was constructed with and fire it.
        handler = mock_observer_cls.return_value.schedule.call_args[0][0]
        handler.callback()

        inner.assert_called_once_with(one_shot=True)
        server.socketio.emit.assert_called_once_with("reload")


class TestRunServer:
    def test_run_server_starts_thread(self, tmp_path):
        server = _server(tmp_path)
        server.socketio = Mock()

        server.run_server("localhost", 8123)
        server.server_thread.join(timeout=2)

        server.socketio.run.assert_called_once()


class TestServe:
    def test_one_shot_runs_ready_callback_then_stops(self, tmp_path):
        server = _server(tmp_path)
        server.socketio = Mock()
        server.run_server = Mock()
        ready_calls = []

        server.serve(
            "localhost",
            8124,
            on_server_ready=lambda one_shot: ready_calls.append(one_shot),
            one_shot=True,
        )

        assert ready_calls == [True]
        server.run_server.assert_called_once()
        # The client-reload script route is registered and serves JS.
        response = server.app.test_client().get("/hot-reload.js")
        assert response.status_code == 200
        assert "socket.on('reload'" in response.get_data(as_text=True)

    def test_error_in_run_server_stops_and_reraises(self, tmp_path):
        server = _server(tmp_path)
        server.socketio = Mock()
        server.run_server = Mock(side_effect=RuntimeError("bind failed"))
        stop_spy = Mock(wraps=server.stop)
        server.stop = stop_spy

        with pytest.raises(RuntimeError, match="bind failed"):
            server.serve("localhost", 8125, one_shot=True)

        stop_spy.assert_called()

    def test_watch_loop_starts_watcher_and_exits_on_stop_event(self, tmp_path):
        server = _server(tmp_path)
        server.socketio = Mock()
        server.run_server = Mock()
        server.start_file_watcher = Mock()

        t = Thread(
            target=server.serve,
            args=("localhost", 8126),
            kwargs={"on_change_callback": Mock(), "one_shot": False},
        )
        t.start()
        try:
            deadline = time.time() + 3
            while not server.start_file_watcher.called and time.time() < deadline:
                time.sleep(0.02)
            assert server.start_file_watcher.called
        finally:
            server.stop_event.set()
            t.join(timeout=3)
        assert not t.is_alive()


class TestStop:
    def test_stops_observer_and_sets_event(self, tmp_path):
        server = _server(tmp_path)
        server.observer = Mock()
        server.server_thread = Mock()

        server.stop()

        server.observer.stop.assert_called_once()
        server.observer.join.assert_called_once()
        assert server.stop_event.is_set()
