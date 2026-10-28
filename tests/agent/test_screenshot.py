"""Looking at the dashboard (VIS-1484).

Playwright is faked with a MagicMock page, the way core's
``api/apps/jobs/tests/test_thumbnail_capture.py`` already does: what is under
test is OUR wait sequence, refusals and sizing, not whether Chromium takes a
screenshot. The browser itself was proven in a gVisor pool pod on VIS-1483.
"""

import os
from unittest import mock

import pytest

from visivo.agent import screenshot
from visivo.agent.tool_types import ToolError
from visivo.agent.tools import TOOLS, call
from visivo.agent.actions import log

# A real 1x1 PNG, so `fit` has something Pillow can open.
ONE_PIXEL_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6300010000050001"
    "0d0a2db40000000049454e44ae426082"
)


@pytest.fixture(autouse=True)
def clean_log():
    log().clear()
    yield
    log().clear()


@pytest.fixture
def page():
    """A page that loads cleanly and screenshots a known PNG."""
    fake = mock.MagicMock()
    fake.goto.return_value = mock.MagicMock(ok=True, status=200)
    fake.screenshot.return_value = ONE_PIXEL_PNG
    return fake


@pytest.fixture
def browser(page, monkeypatch):
    """Stands in for `sync_playwright()`, returning `page`."""
    launched = mock.MagicMock()
    launched.new_page.return_value = page

    chromium = mock.MagicMock()
    chromium.launch.return_value = launched

    playwright = mock.MagicMock()
    playwright.chromium = chromium
    context = mock.MagicMock()
    context.__enter__.return_value = playwright
    context.__exit__.return_value = False

    monkeypatch.setattr(screenshot, "_playwright", lambda: lambda: context)
    monkeypatch.setattr(screenshot, "ensure_browser", lambda: None)
    launched.page = page
    return launched


class TestTheWaitSequence:
    """Ported from core's thumbnail task, which learned it over two incidents."""

    def test_it_waits_for_the_charts_not_just_the_network(self, browser, page):
        """`networkidle` fires while charts are still computing: they fetch
        parquet over the network and THEN render via DuckDB-WASM, which is CPU.
        Waiting only on the network captures spinners."""
        screenshot.capture("http://127.0.0.1:8000/workspace/dashboard/x")

        assert page.wait_for_load_state.called
        waited_for = page.wait_for_function.call_args[0][0]
        assert "loading-spinner" in waited_for

    def test_a_slow_chart_costs_fidelity_not_the_capture(self, browser, page):
        """Best-effort by design. A dashboard that never settles should still
        produce an image of whatever rendered."""
        page.wait_for_function.side_effect = Exception("timeout")

        assert screenshot.capture("http://127.0.0.1:8000/x") == ONE_PIXEL_PNG

    def test_an_error_page_is_refused_rather_than_photographed(self, browser, page):
        """Playwright renders a 503 as a perfectly valid PNG. Without this the
        agent gets a screenshot of an error page and reasons about it as if it
        were the dashboard."""
        page.goto.return_value = mock.MagicMock(ok=False, status=503)

        with pytest.raises(ToolError, match="503"):
            screenshot.capture("http://127.0.0.1:8000/x")

    def test_the_browser_is_closed_on_every_path(self, browser, page):
        page.screenshot.side_effect = Exception("screenshot timed out")

        with pytest.raises(Exception, match="screenshot timed out"):
            screenshot.capture("http://127.0.0.1:8000/x")

        # Core leaked ~250MB per timed-out attempt until it had this, and two
        # leaks exhausted its browser semaphore for the life of the worker.
        assert browser.close.called

    def test_it_captures_the_whole_dashboard_by_default(self, browser, page):
        screenshot.capture("http://127.0.0.1:8000/x")

        assert page.screenshot.call_args.kwargs["full_page"] is True

    def test_a_cookie_is_attached_when_given(self, browser, page):
        """The cloud path needs a credential on the page. Local serve does not,
        and must not send one."""
        cookie = {"name": "__visivo_session", "value": "x", "url": "http://core"}

        screenshot.capture("http://core/a/b/c", cookie=cookie)

        page.context.add_cookies.assert_called_once_with([cookie])

    def test_no_cookie_means_no_cookie(self, browser, page):
        screenshot.capture("http://127.0.0.1:8000/x")

        assert not page.context.add_cookies.called


class TestSizing:
    def test_a_normal_capture_is_left_alone(self):
        png, width, height, scale = screenshot.fit(ONE_PIXEL_PNG)

        assert (png, width, height, scale) == (ONE_PIXEL_PNG, 1, 1, 1.0)

    def test_a_tall_dashboard_is_brought_within_the_providers_limit(self):
        """Past ~1568px the model providers resize blindly, and a 1280x4000
        dashboard comes back 500px wide and unreadable. Doing it here means the
        result can at least say it happened."""
        from io import BytesIO

        from PIL import Image

        tall = BytesIO()
        Image.new("RGB", (1280, 4000), "white").save(tall, format="PNG")

        png, width, height, scale = screenshot.fit(tall.getvalue())

        assert height == screenshot.MAX_LONG_EDGE
        assert width == round(1280 * scale)
        assert scale == pytest.approx(screenshot.MAX_LONG_EDGE / 4000)
        assert png != tall.getvalue()


class TestTheToolRefusesBeforeItFetches:
    """The tool takes a NAME, never a URL. Object names come out of project
    YAML, which the agent's own instructions class as untrusted data — so the
    name is checked against this project before anything reaches a browser.
    """

    def test_an_unknown_dashboard_is_refused(self, integration_app, browser):
        with pytest.raises(ToolError, match="No dashboard named 'nope'"):
            call(integration_app, "screenshot_dashboard", {"name": "nope"})

    def test_the_refusal_names_what_does_exist(self, integration_app, browser):
        """So the model's next call is a real dashboard rather than another
        guess."""
        known = [
            d.name
            for d in integration_app.dashboard_manager.get_all_objects_list()
            if getattr(d, "name", None)
        ]
        assert known, "the integration project should have a dashboard"

        with pytest.raises(ToolError, match=known[0]):
            call(integration_app, "screenshot_dashboard", {"name": "nope"})

    def test_a_missing_name_is_refused(self, integration_app, browser):
        with pytest.raises(ToolError, match="'name' is required"):
            call(integration_app, "screenshot_dashboard", {})

    def test_nothing_is_fetched_when_the_name_is_unknown(self, integration_app, browser, page):
        with pytest.raises(ToolError):
            call(integration_app, "screenshot_dashboard", {"name": "../../etc/passwd"})

        assert not page.goto.called


class TestTheToolOnTheLocalPath:
    def _only_dashboard(self, app):
        return [
            d.name for d in app.dashboard_manager.get_all_objects_list() if getattr(d, "name", None)
        ][0]

    def test_it_captures_the_dashboard_from_this_serve(self, integration_app, browser, page):
        name = self._only_dashboard(integration_app)

        call(integration_app, "screenshot_dashboard", {"name": name})

        url = page.goto.call_args[0][0]
        assert url.startswith("http://127.0.0.1:")
        assert "/workspace/dashboard/" in url

    def test_the_url_uses_this_serves_port(self, integration_app, browser, page, monkeypatch):
        """Hardcoding 8000 is the bug the device-authorize callback already
        hit; `app.port` exists because of it."""
        monkeypatch.setattr(integration_app, "port", 9123, raising=False)
        name = self._only_dashboard(integration_app)

        call(integration_app, "screenshot_dashboard", {"name": name})

        assert "127.0.0.1:9123" in page.goto.call_args[0][0]

    def test_the_model_is_handed_the_image(self, integration_app, browser):
        from pydantic_ai.messages import BinaryContent, ToolReturn

        name = self._only_dashboard(integration_app)

        result = call(integration_app, "screenshot_dashboard", {"name": name})

        assert isinstance(result, ToolReturn)
        assert any(
            isinstance(item, BinaryContent) and item.media_type == "image/png"
            for item in result.content
        )

    def test_the_facts_travel_without_the_bytes(self, integration_app, browser):
        name = self._only_dashboard(integration_app)

        result = call(integration_app, "screenshot_dashboard", {"name": name})

        assert result.return_value["dashboard"] == name
        assert result.return_value["full_page"] is True

    def test_the_capture_is_stored_for_the_agent_tab(self, integration_app, browser):
        name = self._only_dashboard(integration_app)

        result = call(integration_app, "screenshot_dashboard", {"name": name})

        url = result.return_value["image_url"]
        capture_id = url.rsplit("/", 1)[-1].removesuffix(".png")
        assert os.path.exists(screenshot.capture_path(integration_app.output_dir, capture_id))

    def test_it_never_overwrites_the_real_thumbnail(self, integration_app, browser):
        """`dashboards/<name>.png` is the dashboard's own thumbnail. A capture
        landing there would let the agent replace what everyone sees."""
        name = self._only_dashboard(integration_app)
        thumbnail = os.path.join(integration_app.output_dir, "dashboards", f"{name}.png")

        call(integration_app, "screenshot_dashboard", {"name": name})

        assert not os.path.exists(thumbnail)

    def test_the_capture_is_logged_against_the_dashboard(self, integration_app, browser):
        """So the Agent tab can address it as `dashboard:<name>` like every
        other action."""
        name = self._only_dashboard(integration_app)

        call(integration_app, "screenshot_dashboard", {"name": name})

        entries = [a for a in log().since(0) if a["tool"] == "screenshot_dashboard"]
        assert entries[-1]["object"] == {"type": "dashboard", "name": name}

    def test_a_storage_failure_does_not_lose_the_capture(
        self, integration_app, browser, monkeypatch
    ):
        """The model already has the image by then. Only the tab loses out."""
        monkeypatch.setattr(screenshot.os, "makedirs", mock.Mock(side_effect=OSError("read-only")))
        name = self._only_dashboard(integration_app)

        result = call(integration_app, "screenshot_dashboard", {"name": name})

        assert "image_url" not in result.return_value
        assert result.content


class TestWaitingForTheData:
    """A draft save triggers a run. Capturing before it settles screenshots
    spinners however patiently the page is polled. The waiting itself is
    `visivo.agent.runs.wait_for_runs` and is tested there."""

    def test_an_unsettled_run_is_reported_with_the_image(
        self, integration_app, browser, monkeypatch
    ):
        """Still a useful picture — the layout is visible even if a chart is
        mid-render — so it comes back with a caveat rather than an error."""
        monkeypatch.setattr(screenshot, "wait_for_runs", lambda app, **kw: False)
        name = [
            d.name
            for d in integration_app.dashboard_manager.get_all_objects_list()
            if getattr(d, "name", None)
        ][0]

        result = call(integration_app, "screenshot_dashboard", {"name": name})

        assert "still building" in result.return_value["warning"]


class TestWhenThereIsNoBrowser:
    def test_a_missing_package_says_how_to_get_it(self, monkeypatch):
        """A tool cannot safely pip-install into someone's environment, and the
        Nuitka runner binary cannot at all — so this one refuses with the
        command rather than running it."""
        import builtins

        real_import = builtins.__import__

        def no_playwright(name, *args, **kwargs):
            if name.startswith("playwright"):
                raise ImportError("No module named 'playwright'")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", no_playwright)

        with pytest.raises(screenshot.BrowserUnavailable, match=r"visivo\[screenshot\]"):
            screenshot._playwright()

    def test_a_missing_pillow_says_how_to_get_it_too(self, monkeypatch):
        """The cloud runner shipped Playwright but not Pillow, so a capture
        got all the way through a browser launch and a full-page screenshot
        and then died on `No module named 'PIL'`."""
        import builtins

        real_import = builtins.__import__

        def no_pillow(name, *args, **kwargs):
            if name == "PIL" or name.startswith("PIL."):
                raise ImportError("No module named 'PIL'")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", no_pillow)

        with pytest.raises(screenshot.BrowserUnavailable, match=r"visivo\[screenshot\]"):
            screenshot._pillow()

    def test_a_missing_package_is_found_before_a_browser_is_launched(
        self, integration_app, monkeypatch
    ):
        """Spending a launch and a capture on a turn that cannot finish is the
        expensive way to learn the image is wrong."""
        launched = []
        monkeypatch.setattr(screenshot, "capture", lambda *a, **kw: launched.append(1) or b"png")
        monkeypatch.setattr(
            screenshot,
            "_pillow",
            lambda: (_ for _ in ()).throw(screenshot.BrowserUnavailable("no pillow")),
        )
        name = [
            d.name
            for d in integration_app.dashboard_manager.get_all_objects_list()
            if getattr(d, "name", None)
        ][0]

        with pytest.raises(ToolError):
            call(integration_app, "screenshot_dashboard", {"name": name})

        assert launched == []

    def test_a_missing_browser_is_installed_once(self, monkeypatch):
        """The 260MB download blocks the first call. Doing it per call would
        make every capture a minute long."""
        monkeypatch.setattr(screenshot._installed, "clear", lambda: None)
        screenshot._installed.clear()

        launches = {"n": 0}

        def launch(**kwargs):
            launches["n"] += 1
            raise Exception("Executable doesn't exist at /x/chrome")

        chromium = mock.MagicMock()
        chromium.launch = launch
        playwright = mock.MagicMock(chromium=chromium)
        context = mock.MagicMock()
        context.__enter__.return_value = playwright
        context.__exit__.return_value = False
        monkeypatch.setattr(screenshot, "_playwright", lambda: lambda: context)

        installs = mock.Mock(return_value=mock.Mock(returncode=0))
        monkeypatch.setattr(screenshot.subprocess, "run", installs)

        screenshot.ensure_browser()
        screenshot.ensure_browser()

        assert installs.call_count == 1
        assert "--only-shell" in installs.call_args[0][0]

    def test_a_packaged_build_refuses_instead_of_shelling_out(self, monkeypatch):
        """In a frozen build `sys.executable` is the visivo binary, so
        `-m playwright install` re-invokes the CLI with arguments it does not
        understand. The refusal has to come before that, not after it fails."""
        screenshot._installed.clear()
        monkeypatch.setattr(screenshot, "is_frozen", lambda: True)

        chromium = mock.MagicMock()
        chromium.launch = mock.Mock(side_effect=Exception("Executable doesn't exist at /x/chrome"))
        playwright = mock.MagicMock(chromium=chromium)
        context = mock.MagicMock()
        context.__enter__.return_value = playwright
        context.__exit__.return_value = False
        monkeypatch.setattr(screenshot, "_playwright", lambda: lambda: context)

        installs = mock.Mock()
        monkeypatch.setattr(screenshot.subprocess, "run", installs)

        with pytest.raises(screenshot.BrowserUnavailable) as refusal:
            screenshot.ensure_browser()

        assert installs.call_count == 0
        message = str(refusal.value)
        assert "packaged build" in message
        assert "PLAYWRIGHT_BROWSERS_PATH" in message

    def test_a_packaged_build_still_uses_a_browser_it_can_find(self, monkeypatch):
        """Refusing the DOWNLOAD is not refusing the feature — a packaged build
        pointed at an existing Chromium captures normally."""
        screenshot._installed.clear()
        monkeypatch.setattr(screenshot, "is_frozen", lambda: True)

        chromium = mock.MagicMock()
        playwright = mock.MagicMock(chromium=chromium)
        context = mock.MagicMock()
        context.__enter__.return_value = playwright
        context.__exit__.return_value = False
        monkeypatch.setattr(screenshot, "_playwright", lambda: lambda: context)
        monkeypatch.setattr(screenshot.subprocess, "run", mock.Mock())

        screenshot.ensure_browser()

        assert screenshot._installed.is_set()

    def test_a_failed_install_says_why(self, monkeypatch):
        screenshot._installed.clear()

        chromium = mock.MagicMock()
        chromium.launch = mock.Mock(side_effect=Exception("Executable doesn't exist at /x/chrome"))
        playwright = mock.MagicMock(chromium=chromium)
        context = mock.MagicMock()
        context.__enter__.return_value = playwright
        context.__exit__.return_value = False
        monkeypatch.setattr(screenshot, "_playwright", lambda: lambda: context)
        monkeypatch.setattr(
            screenshot.subprocess,
            "run",
            mock.Mock(return_value=mock.Mock(returncode=1, stderr="no disk space", stdout="")),
        )

        with pytest.raises(screenshot.BrowserUnavailable, match="no disk space"):
            screenshot.ensure_browser()

    def test_a_real_launch_failure_is_not_mistaken_for_a_missing_browser(self, monkeypatch):
        """Only "Executable doesn't exist" means "not installed". Treating
        every failure that way would download 260MB in response to a crash."""
        screenshot._installed.clear()

        chromium = mock.MagicMock()
        chromium.launch = mock.Mock(side_effect=Exception("Target page crashed"))
        playwright = mock.MagicMock(chromium=chromium)
        context = mock.MagicMock()
        context.__enter__.return_value = playwright
        context.__exit__.return_value = False
        monkeypatch.setattr(screenshot, "_playwright", lambda: lambda: context)
        installs = mock.Mock()
        monkeypatch.setattr(screenshot.subprocess, "run", installs)

        with pytest.raises(Exception, match="Target page crashed"):
            screenshot.ensure_browser()
        assert not installs.called


class TestTheToolIsOffered:
    def test_it_is_in_the_registry(self):
        assert "screenshot_dashboard" in TOOLS

    def test_it_takes_a_name_and_not_a_url(self):
        """The control, stated as a schema. A tool that accepted a URL would
        turn a prompt injection into an SSRF with a browser attached."""
        schema = TOOLS["screenshot_dashboard"].input_schema

        assert set(schema["properties"]) == {"name", "full_page"}
        assert schema["required"] == ["name"]


class TestTheCaptureReachesTheAgentTab:
    """The transcript should show what the agent was looking at when it decided
    something, rather than asking the reader to take its word for it."""

    def _only_dashboard(self, app):
        return [
            d.name for d in app.dashboard_manager.get_all_objects_list() if getattr(d, "name", None)
        ][0]

    def test_the_action_carries_the_image(self, integration_app, browser):
        name = self._only_dashboard(integration_app)

        call(integration_app, "screenshot_dashboard", {"name": name})

        entry = [a for a in log().since(0) if a["tool"] == "screenshot_dashboard"][-1]
        assert entry["image_url"].startswith("/api/agent/captures/")

    def test_every_other_action_has_the_field_and_no_image(self, integration_app):
        """Additive: the action is a fixed dict every consumer reads by key, so
        a nullable field costs the other 61 tools nothing."""
        call(integration_app, "list_dashboards", {})

        entry = log().since(0)[-1]
        assert entry["image_url"] is None

    def test_a_capture_that_could_not_be_stored_logs_no_image(
        self, integration_app, browser, monkeypatch
    ):
        monkeypatch.setattr(screenshot.os, "makedirs", mock.Mock(side_effect=OSError("read-only")))
        name = self._only_dashboard(integration_app)

        call(integration_app, "screenshot_dashboard", {"name": name})

        entry = [a for a in log().since(0) if a["tool"] == "screenshot_dashboard"][-1]
        assert entry["image_url"] is None


class TestTheCloudPath:
    """Local and cloud differ in the URL and whether a cookie is set, and in
    nothing else (VIS-1486). A fork in the capture would be a cloud agent that
    disagreed with the local one about what it was looking at.
    """

    def _cloud_project(self, dashboard="revenue", permit=("rtok", "/acme/main/proj/revenue")):
        """A RemoteProject whose core answers the screenshot calls."""
        from tests.agent.test_remote import FakeCore, FakeResponse, _envelope
        from visivo.agent.remote import RemoteProject
        from visivo.cloud_api import CloudApi

        class ScreenshotCore(FakeCore):
            def __init__(self):
                super().__init__({"dashboards": [_envelope(dashboard, {"name": dashboard})]})
                self.minted = []
                self.uploaded = []
                self.put_bodies = []

            def post(self, url, json=None, timeout=None):
                if url.endswith("/agent/render-token/"):
                    self.minted.append(json)
                    return FakeResponse({"token": permit[0], "path": permit[1]}, 201)
                if url.endswith("/agent/captures/"):
                    self.uploaded.append(json)
                    return FakeResponse(
                        [{"id": "f1", "upload_url": "https://storage/obj.png?X-Goog-Sig=abc"}], 201
                    )
                return super().post(url, json=json, timeout=timeout)

            def put(self, url, data=None, headers=None, timeout=None):
                self.put_bodies.append((url, data, headers))
                return FakeResponse({}, 200)

        core = ScreenshotCore()
        project = RemoteProject(
            CloudApi("https://core.svc.cluster.local", "tok", "p1", session=core)
        )
        return project, core

    def test_it_asks_core_where_the_dashboard_is(self, browser, page):
        """Rather than assembling account/stage/project into a path here. Three
        strings a prompt-injected agent could influence, for the one URL a
        credentialed browser then loads."""
        project, core = self._cloud_project()

        call(project, "screenshot_dashboard", {"name": "revenue"})

        assert core.minted == [{"dashboard": "revenue"}]
        assert page.goto.call_args[0][0] == (
            "https://core.svc.cluster.local/acme/main/proj/revenue"
        )

    def test_the_page_carries_the_render_token(self, browser, page):
        project, _core = self._cloud_project()

        call(project, "screenshot_dashboard", {"name": "revenue"})

        cookie = page.context.add_cookies.call_args[0][0][0]
        assert cookie["name"] == "__visivo_session"
        assert cookie["value"] == "rtok"

    def test_the_capture_goes_straight_to_storage(self, browser):
        """Not through core. Core signs the PUT, so the runner can neither
        choose where the bytes land nor reach another account's prefix."""
        project, core = self._cloud_project()

        call(project, "screenshot_dashboard", {"name": "revenue"})

        url, body, headers = core.put_bodies[0]
        assert url.startswith("https://storage/")
        assert body == ONE_PIXEL_PNG
        assert headers["Content-Type"] == "image/png"

    def test_the_stored_url_drops_the_signature(self, browser):
        """The query string is the signature, which is not ours to hand on to
        the Agent tab."""
        project, _core = self._cloud_project()

        result = call(project, "screenshot_dashboard", {"name": "revenue"})

        assert result.return_value["image_url"] == "https://storage/obj.png"

    def test_an_unknown_dashboard_never_reaches_core(self, browser, page):
        """The name is checked against the hydrated project first, so a bad
        name costs nothing and leaks nothing."""
        project, core = self._cloud_project()

        with pytest.raises(ToolError, match="No dashboard named"):
            call(project, "screenshot_dashboard", {"name": "nope"})

        assert core.minted == []
        assert not page.goto.called

    def test_core_refusing_to_place_the_dashboard_is_an_error_not_a_guess(self, browser, page):
        project, _core = self._cloud_project(permit=(None, None))

        with pytest.raises(ToolError, match="would not say where"):
            call(project, "screenshot_dashboard", {"name": "revenue"})

        assert not page.goto.called

    def test_a_storage_failure_still_hands_the_model_the_image(self, browser):
        project, core = self._cloud_project()
        core.put = mock.Mock(side_effect=Exception("signed URL expired"))

        result = call(project, "screenshot_dashboard", {"name": "revenue"})

        assert "image_url" not in result.return_value
        assert result.content

    def test_the_model_sees_the_same_thing_it_sees_locally(self, integration_app, browser):
        """The acceptance criterion for the cloud path: parity, not features."""
        from pydantic_ai.messages import BinaryContent

        project, _core = self._cloud_project()
        local_name = [
            d.name
            for d in integration_app.dashboard_manager.get_all_objects_list()
            if getattr(d, "name", None)
        ][0]

        cloud = call(project, "screenshot_dashboard", {"name": "revenue"})
        local = call(integration_app, "screenshot_dashboard", {"name": local_name})

        def image_of(result):
            return next(item.data for item in result.content if isinstance(item, BinaryContent))

        assert image_of(cloud) == image_of(local)
        assert set(cloud.return_value) - {"image_url"} == set(local.return_value) - {"image_url"}


class TestTheCloudPageLoads:
    """Core runs with SECURE_SSL_REDIRECT, and in cluster the browser reaches
    it by the web Service's DNS name over plain HTTP.

    Observed: `Page.goto: Timeout 60000ms exceeded` navigating to
    `http://core-...-core-web.core.svc.cluster.local/...`. Core answered 301
    to https://<service>, the browser followed, nothing was listening for TLS
    there, and the navigation hung until the timeout rather than failing with
    a status anyone could read.
    """

    def test_the_cloud_page_declares_the_proxy_protocol(self, browser, page):
        """SECURE_PROXY_SSL_HEADER trusts exactly this header. CloudApi sends
        it on its own requests; the browser is a second client."""
        cookie = {"name": "__visivo_session", "value": "t", "url": "http://core"}

        screenshot.capture("http://core/acme/main/proj/revenue", cookie=cookie)

        page.set_extra_http_headers.assert_called_once_with({"X-Forwarded-Proto": "https"})

    def test_a_local_capture_sends_no_proxy_header(self, browser, page):
        """`visivo serve` has no redirect to avoid, and claiming https to it
        would be a lie about the connection."""
        screenshot.capture("http://127.0.0.1:8000/workspace/dashboard/x")

        assert not page.set_extra_http_headers.called
