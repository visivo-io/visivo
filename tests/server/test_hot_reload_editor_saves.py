import os
import time
from threading import Event, Lock
from unittest.mock import Mock, patch

import pytest
from watchdog.events import FileCreatedEvent, FileModifiedEvent, FileMovedEvent
from watchdog.observers import Observer

from visivo.server.hot_reload_server import (
    ProjectChangeHandler,
    is_editor_temp_file,
    project_file_matcher,
)


def _wait_for(condition, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if condition():
            return True
        time.sleep(0.02)
    return condition()


@pytest.fixture
def project_dir(tmp_path):
    (tmp_path / "project.visivo.yml").write_text(
        "name: demo\nincludes:\n  - path: models\n  - path: charts.yml\n"
    )
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "orders.yml").write_text("models: []\n")
    (tmp_path / "charts.yml").write_text("charts: []\n")
    return tmp_path


class TestRealEditorSaves:
    def _watch(self, project_dir, callback):
        # macOS FSEvents can replay the fixture's own writes after start, so
        # let those settle before the test's save is recorded.
        recording = Event()
        handler = ProjectChangeHandler(
            lambda: recording.is_set() and callback(),
            is_project_file=project_file_matcher(str(project_dir), str(project_dir / "target")),
            debounce_seconds=0.3,
        )
        observer = Observer()
        observer.schedule(handler, str(project_dir), recursive=True)
        observer.start()
        time.sleep(1.0)
        recording.set()
        return observer

    def test_temp_file_renamed_over_project_file_reloads_new_content_once(self, project_dir):
        project_file = project_dir / "project.visivo.yml"
        seen = []
        observer = self._watch(project_dir, lambda: seen.append(project_file.read_text()))
        try:
            new_content = project_file.read_text().replace("name: demo", "name: edited")
            temp_file = project_dir / "tmp.yml"
            temp_file.write_text(new_content)
            time.sleep(0.6)
            os.replace(temp_file, project_file)

            assert _wait_for(lambda: seen)
            time.sleep(0.8)
        finally:
            observer.stop()
            observer.join()

        assert seen == [new_content]

    def test_vim_style_backup_then_new_file_reloads_new_content(self, project_dir):
        included = project_dir / "charts.yml"
        seen = []
        observer = self._watch(project_dir, lambda: seen.append(included.read_text()))
        try:
            os.replace(included, project_dir / "charts.yml~")
            included.write_text("charts:\n  - name: c\n")
            assert _wait_for(lambda: seen)
            time.sleep(0.8)
        finally:
            observer.stop()
            observer.join()

        assert seen[-1] == "charts:\n  - name: c\n"

    def test_yaml_outside_the_project_does_not_reload(self, project_dir):
        callback = Mock()
        observer = self._watch(project_dir, callback)
        try:
            (project_dir / "scratch.yml").write_text("a: 1\n")
            time.sleep(1.0)
        finally:
            observer.stop()
            observer.join()

        callback.assert_not_called()


class TestEventKinds:
    def _handler(self, callback, **kwargs):
        return ProjectChangeHandler(callback, debounce_seconds=0.01, **kwargs)

    def test_moved_uses_destination_path(self):
        callback = Mock()
        handler = self._handler(callback, is_project_file=lambda p: p == "/p/project.visivo.yml")
        handler.on_moved(FileMovedEvent("/p/tmp.yml", "/p/project.visivo.yml"))
        assert _wait_for(lambda: callback.called)

    def test_moved_away_from_project_file_is_ignored(self):
        callback = Mock()
        handler = self._handler(callback)
        handler.on_moved(FileMovedEvent("/p/project.visivo.yml", "/p/project.visivo.yml.bak"))
        time.sleep(0.1)
        callback.assert_not_called()

    def test_created_triggers(self):
        callback = Mock()
        handler = self._handler(callback)
        handler.on_created(FileCreatedEvent("/p/models/new.yml"))
        assert _wait_for(lambda: callback.called)

    def test_editor_lock_file_is_ignored(self):
        callback = Mock()
        handler = self._handler(callback)
        handler.on_created(FileCreatedEvent("/p/.#project.visivo.yml"))
        handler.on_modified(FileModifiedEvent("/p/.~lock.project.visivo.yml"))
        time.sleep(0.1)
        callback.assert_not_called()

    def test_burst_of_events_runs_callback_once(self):
        callback = Mock()
        handler = ProjectChangeHandler(callback, debounce_seconds=0.3)
        for _ in range(5):
            handler.on_modified(FileModifiedEvent("/p/project.visivo.yml"))
            time.sleep(0.01)
        handler.on_moved(FileMovedEvent("/p/tmp.yml", "/p/project.visivo.yml"))
        time.sleep(0.9)
        callback.assert_called_once()

    def test_changes_during_a_running_callback_run_it_once_more_after(self):
        started = Event()
        release = Event()
        calls = []

        def callback():
            calls.append(time.time())
            if len(calls) == 1:
                started.set()
                release.wait(2)

        handler = self._handler(callback)
        handler.on_modified(FileModifiedEvent("/p/project.visivo.yml"))
        assert started.wait(2)
        handler.on_modified(FileModifiedEvent("/p/project.visivo.yml"))
        time.sleep(0.1)
        handler.on_modified(FileModifiedEvent("/p/project.visivo.yml"))
        time.sleep(0.1)
        release.set()
        assert _wait_for(lambda: len(calls) == 2)
        time.sleep(0.2)
        assert len(calls) == 2

    def test_pause_taken_before_the_debounce_ends_drops_the_change(self):
        callback = Mock()
        lock = Lock()
        handler = ProjectChangeHandler(callback, pause_lock=lock, debounce_seconds=0.5)
        handler.on_modified(FileModifiedEvent("/p/project.visivo.yml"))
        lock.acquire()
        try:
            time.sleep(1.0)
        finally:
            lock.release()
        callback.assert_not_called()


class TestProjectFileMatcher:
    def test_matches_project_file_and_includes(self, project_dir):
        matches = project_file_matcher(str(project_dir), str(project_dir / "target"))
        assert matches(str(project_dir / "project.visivo.yml"))
        assert matches(str(project_dir / "charts.yml"))
        assert matches(str(project_dir / "models" / "orders.yml"))
        assert not matches(str(project_dir / "tmp.yml"))

    def test_new_file_in_included_directory_matches(self, project_dir):
        matches = project_file_matcher(str(project_dir), str(project_dir / "target"))
        new_file = project_dir / "models" / "customers.yml"
        new_file.write_text("models: []\n")
        assert matches(str(new_file))

    def test_unreadable_project_matches_everything(self, project_dir):
        (project_dir / "project.visivo.yml").write_text("includes:\n  - path: missing.yml\n")
        matches = project_file_matcher(str(project_dir), str(project_dir / "target"))
        assert matches(str(project_dir / "tmp.yml"))


@pytest.mark.parametrize(
    "path,expected",
    [
        ("/p/.#project.visivo.yml", True),
        ("/p/.~lock.charts.yml", True),
        ("/p/project.visivo.yml", False),
        ("/p/.hidden.yml", False),
    ],
)
def test_is_editor_temp_file(path, expected):
    assert is_editor_temp_file(path) is expected


@patch("visivo.server.hot_reload_server.Observer")
def test_hot_reload_server_passes_matcher_to_handler(mock_observer_cls, tmp_path):
    from flask import Flask

    from visivo.server.hot_reload_server import HotReloadServer

    matcher = Mock(return_value=True)
    server = HotReloadServer(
        app=Flask(f"editor_saves_{time.time_ns()}"),
        on_project_change=Mock(),
        watch_path=str(tmp_path),
        is_project_file=matcher,
    )
    server.start_file_watcher(Mock())
    handler = mock_observer_cls.return_value.schedule.call_args[0][0]
    assert handler.is_project_file is matcher
