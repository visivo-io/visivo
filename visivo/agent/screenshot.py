"""Letting the agent look at the dashboard it built (VIS-1484).

The agent writes dashboards blind. It can read configs, validate them and
query data, but it has never seen the result — so an overlapping legend, a
chart squeezed to nothing, a row that wrapped are all invisible to it, and only
the person it is helping finds them.

## The wait is the hard part, and it is not ours

Core's deploy-time thumbnail task learned this over two incidents. Charts fetch
parquet over the network and *then* render via DuckDB-WASM, which is CPU, not
network — so ``networkidle`` fires while they are still computing and you
capture a page full of spinners. The viewer tags every in-flight chart with
``.loading-spinner``, so that is the signal to wait on. The sequence here is a
port of ``api/apps/jobs/tasks.py::_capture``, deliberately, down to the
HTTP-status guard: Playwright renders an error page as a perfectly valid PNG,
and a screenshot of a 503 is worse than no screenshot.

Before any of that, the DATA has to exist. A draft save triggers a run
(``save_run_executor.request_run`` locally), and capturing before it settles
screenshots the spinner regardless of how patiently the page is polled. So the
run is waited on first and the spinner poll is the second line of defence.

## One capture, two call sites

``capture`` takes a URL and an optional cookie and knows nothing else. Local
serve points it at ``127.0.0.1``; the runner will point it at core with a
render token. Anything that forks here produces a cloud agent that disagrees
with the local one about what it is looking at.

## The browser is not a hard dependency

``visivo[screenshot]`` brings the Playwright package; the 260MB browser is
downloaded on first use. Visivo is a CLI someone installs to look at their own
data, and most of them will never ask for a screenshot.

A packaged build cannot do that download at all (see ``visivo.frozen``), so it
refuses with the reason rather than shelling out to a `sys.executable` that is
not an interpreter. A browser already on the machine still works.
"""

import os
import subprocess
import sys
import threading

from visivo.frozen import is_frozen
from visivo.agent.actions import log as action_log
from visivo.agent.runs import wait_for_runs
from visivo.agent.images import image_result
from visivo.agent.tool_types import Tool, ToolError
from visivo.logger.logger import Logger

# A desktop-ish viewport. Width drives the dashboard's own responsive layout,
# so this is the shape being judged, not just the shape being captured.
VIEWPORT = {"width": 1280, "height": 800}

# Beyond this the model providers downscale the image themselves, and theirs is
# a blind resize. Ours at least reports that it happened.
MAX_LONG_EDGE = 1568

# Below this the text in a chart is unlikely to be legible, so the result says
# so rather than letting the model squint and guess.
SEVERE_SCALE = 0.5

# Chromium is ~260MB resident. Two at once fits the runner's per-slot ceiling
# and a laptop; more would not help, since a capture is mostly waiting.
_BROWSERS = threading.BoundedSemaphore(2)

# How long to wait for the draft's run before capturing anyway. A capture of a
# half-built dashboard is worth more than no capture plus an explanation.

GOTO_TIMEOUT_MS = 60_000
NETWORK_IDLE_TIMEOUT_MS = 30_000
SPINNER_TIMEOUT_MS = 30_000
SCREENSHOT_TIMEOUT_MS = 30_000

# Plotly paints the final frame a tick after the spinners clear.
PAINT_SETTLE_MS = 500

INSTALL_TIMEOUT_SECONDS = 600


class BrowserUnavailable(ToolError):
    """No browser, and nothing this process can do about it."""


def _playwright():
    try:
        from playwright.sync_api import sync_playwright

        return sync_playwright
    except ImportError:
        raise BrowserUnavailable(
            "Screenshots need a headless browser, which is not installed. "
            "Install it with: pip install 'visivo[screenshot]'"
        )


def _pillow():
    try:
        from PIL import Image

        return Image
    except ImportError:
        raise BrowserUnavailable(
            "Screenshots need Pillow to downscale the capture, and it is not "
            "installed. Install it with: pip install 'visivo[screenshot]'"
        )


_installed = threading.Event()


def ensure_browser():
    """Download Chromium if it is missing. Once per process.

    Blocks the first call for a minute or two. The alternative is refusing a
    tool call with an instruction to go and run a command, which in the middle
    of an agent turn means the turn fails for a reason the user cannot act on
    until it is over.

    The PACKAGE is never installed here — that would mean writing to someone's
    environment from inside a tool call.

    A packaged build refuses instead of downloading, because the download needs
    an interpreter at `sys.executable` and there is a binary there. The launch
    is still attempted first, so a packaged build with a browser already on the
    machine works.
    """
    if _installed.is_set():
        return
    sync_playwright = _playwright()

    try:
        with sync_playwright() as playwright:
            playwright.chromium.launch(headless=True, args=LAUNCH_ARGS).close()
        _installed.set()
        return
    except Exception as error:
        if "Executable doesn't exist" not in str(error):
            raise

    if is_frozen():
        raise BrowserUnavailable(
            "Screenshots need Chromium, and this packaged build of Visivo cannot "
            "download it: the download runs `python -m playwright install`, and in a "
            "packaged build `sys.executable` is the visivo binary rather than a Python "
            "interpreter. Install Chromium separately with "
            "`pip install 'visivo[screenshot]' && playwright install --only-shell chromium`, "
            "and point this build at it with PLAYWRIGHT_BROWSERS_PATH."
        )

    Logger.instance().info("Downloading Chromium for dashboard screenshots (one-off, ~260MB)")
    action_log().record(
        "screenshot_dashboard",
        summary="Downloading Chromium for screenshots — one-off, about 260MB",
    )
    result = subprocess.run(
        [sys.executable, "-m", "playwright", "install", "--only-shell", "chromium"],
        capture_output=True,
        text=True,
        timeout=INSTALL_TIMEOUT_SECONDS,
    )
    if result.returncode != 0:
        raise BrowserUnavailable(
            "Could not download Chromium for screenshots: "
            f"{(result.stderr or result.stdout or '').strip()[:300]}"
        )
    _installed.set()


# Core's args, unchanged. `--no-sandbox` is what lets Chromium run under
# gVisor in the runner pool; the rest are its own.
LAUNCH_ARGS = [
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--disable-web-security",
    "--no-sandbox",
]


def _settle(page, url):
    """Drive one page to the point where a screenshot means something."""
    response = page.goto(url, wait_until="domcontentloaded", timeout=GOTO_TIMEOUT_MS)
    # Playwright renders an error page as a valid PNG, so without this a 503
    # becomes a screenshot the agent then reasons about as if it were the
    # dashboard.
    if response is not None and not response.ok:
        raise ToolError(f"The dashboard page returned {response.status}.")

    for wait, how in (
        (
            lambda: page.wait_for_load_state("networkidle", timeout=NETWORK_IDLE_TIMEOUT_MS),
            "network",
        ),
        (
            lambda: page.wait_for_function(
                "() => document.querySelectorAll('.loading-spinner').length === 0",
                timeout=SPINNER_TIMEOUT_MS,
            ),
            "charts",
        ),
    ):
        try:
            wait()
        except Exception as error:
            # Best-effort by design: a slow chart should cost fidelity, not the
            # whole capture.
            Logger.instance().debug(f"Screenshot waited out {how} on {url}: {error}")

    page.wait_for_timeout(PAINT_SETTLE_MS)


# What stops core bouncing a plain-HTTP page load into an https redirect.
#
# In cluster the browser reaches core by the web Service's DNS name, over
# plain HTTP. Core runs with SECURE_SSL_REDIRECT, so without this it answers
# 301 to https://<service>, the browser follows, and nothing is listening for
# TLS there — so the navigation hangs until Playwright's timeout rather than
# failing with a status anyone can read.
#
# SECURE_PROXY_SSL_HEADER trusts exactly this header. `CloudApi` already sends
# it on its own requests for the same reason; the browser is a second client
# that had to be told separately.
FORWARDED_PROTO = {"X-Forwarded-Proto": "https"}


def capture(url, cookie=None, full_page=True):
    """A PNG of ``url``, once it has stopped moving.

    ``cookie`` is a Playwright cookie dict, for the cloud path where the page
    needs a credential. Local serve needs none, and gets no proxy header
    either — `visivo serve` has no redirect to avoid.
    """
    ensure_browser()
    sync_playwright = _playwright()

    with _BROWSERS:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, args=LAUNCH_ARGS)
            try:
                page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
                if cookie:
                    page.context.add_cookies([cookie])
                    page.set_extra_http_headers(FORWARDED_PROTO)
                _settle(page, url)
                return page.screenshot(full_page=full_page, timeout=SCREENSHOT_TIMEOUT_MS)
            finally:
                # Every exit path. Core leaked ~250MB per timed-out attempt
                # until it had this, and two leaks exhausted its semaphore for
                # the life of the worker.
                browser.close()


def fit(png):
    """``(png, width, height, scale)`` with the long edge within budget.

    Downscaling is about what the PROVIDER would otherwise do: past ~1568px it
    resizes blindly, and a 1280x4000 dashboard comes back 500px wide and
    unreadable. Doing it here means the result can at least say so.

    Token cost is NOT the reason — measured on gemini-2.5-pro, a 640x400 image
    and a 1280x1568 one both cost 1806 tokens (VIS-1482). Capturing small buys
    nothing.
    """
    from io import BytesIO

    Image = _pillow()
    image = Image.open(BytesIO(png))
    width, height = image.size
    longest = max(width, height)
    if longest <= MAX_LONG_EDGE:
        return png, width, height, 1.0

    scale = MAX_LONG_EDGE / longest
    resized = image.resize((round(width * scale), round(height * scale)), Image.LANCZOS)
    if resized.mode not in ("RGB", "L"):
        resized = resized.convert("RGB")
    out = BytesIO()
    resized.save(out, format="PNG", optimize=True)
    return out.getvalue(), resized.width, resized.height, scale


# --- the tool ---------------------------------------------------------------

# Where a capture lands under the serve output dir, and the route that serves
# it back. A sibling of `dashboards/<name>.png` rather than that path itself:
# that one is the dashboard's real thumbnail and an agent must not overwrite it.
CAPTURE_DIR = ("dashboards", "agent")
CAPTURE_URL = "/api/agent/captures/{capture_id}.png"


def capture_path(output_dir, capture_id):
    return os.path.join(output_dir, *CAPTURE_DIR, f"{capture_id}.png")


def _dashboard_or_refuse(app, arguments):
    """The dashboard this call is about, or a refusal naming what exists.

    The tool takes a NAME, never a URL, and the name is checked against this
    project before anything is fetched. Object names come out of project YAML,
    which the agent's own instructions class as untrusted data — so "the model
    asked for it" is not a reason to put a string in front of a browser.
    """
    name = (arguments or {}).get("name")
    if not isinstance(name, str) or not name.strip():
        raise ToolError("'name' is required — the dashboard to look at.")

    manager = getattr(app, "dashboard_manager", None)
    if manager is None:
        raise ToolError("This server has no dashboards.")
    if manager.get(name) is None:
        known = [d.name for d in manager.get_all_objects_list() if getattr(d, "name", None)]
        raise ToolError(
            f"No dashboard named '{name}'."
            + (f" This project has: {', '.join(sorted(known))}." if known else "")
        )
    return name


def _local_url(app, name):
    from urllib.parse import quote

    port = getattr(app, "port", None) or 8000
    return f"http://127.0.0.1:{port}/workspace/dashboard/{quote(name, safe='')}"


def _save(app, png, name):
    """Persist the capture and return its URL, or ``None``.

    A capture that cannot be written is not a failed capture — the model has
    already been handed the image. Only the Agent tab loses out, so this
    degrades rather than raising.
    """
    import uuid

    output_dir = getattr(app, "output_dir", None)
    if not output_dir:
        return None
    capture_id = f"{name}-{uuid.uuid4().hex[:8]}"
    path = capture_path(output_dir, capture_id)
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as out:
            out.write(png)
    except OSError as error:
        Logger.instance().debug(f"Could not store the agent capture: {error}")
        return None
    return CAPTURE_URL.format(capture_id=capture_id)


def _cloud_target(client, name):
    """``(url, cookie)`` for a dashboard that lives in core.

    The cookie is the shape the SPA reads (``app/src/models/Session.js``), so
    the page authenticates its own fetches without the viewer learning
    anything new.
    """
    token, path = client.render_permit(name)
    if not token or not path:
        raise ToolError("Core would not say where that dashboard is.")
    return (
        f"{client.base_url}{path}",
        {"name": "__visivo_session", "value": token, "url": client.base_url},
    )


def _store_in_cloud(client, png, name):
    """Upload the capture and return its URL, or ``None``.

    Signing, uploading and naming the object are `CloudApi.put_screenshot`'s
    business, not this tool's. Best-effort, like the local path: the model
    already has the image, so a storage failure costs the Agent tab a
    thumbnail and nothing else.
    """
    try:
        return client.put_screenshot(png, name)
    except Exception as error:
        Logger.instance().debug(f"Could not store the agent capture in cloud: {error}")
        return None


def _screenshot_handler(app, arguments):
    name = _dashboard_or_refuse(app, arguments)
    full_page = (arguments or {}).get("full_page", True)

    # One capture, two call sites. They differ in the URL and whether a cookie
    # is set, and in nothing else — a fork here would be a cloud agent that
    # disagreed with the local one about what it was looking at.
    client = getattr(app, "core_client", None)
    if client is None:
        url_to_load, cookie = _local_url(app, name), None
    else:
        url_to_load, cookie = _cloud_target(client, name)

    # Both halves of the screenshot extra, before a browser launch and a
    # full-page capture are spent on a turn that cannot finish.
    _playwright()
    _pillow()

    settled = wait_for_runs(app)
    png, width, height, scale = fit(capture(url_to_load, cookie=cookie, full_page=bool(full_page)))
    url = _save(app, png, name) if client is None else _store_in_cloud(client, png, name)

    facts = {
        "dashboard": name,
        "width": width,
        "height": height,
        "full_page": bool(full_page),
    }
    if url:
        facts["image_url"] = url
    if not settled:
        facts["warning"] = (
            "A run was still building when this was taken, so some charts may "
            "be mid-render. Take it again to see the finished state."
        )
    if scale < SEVERE_SCALE:
        facts["scale"] = round(scale, 2)
        facts["note"] = (
            f"This dashboard is tall, so the image was scaled to {round(scale * 100)}% "
            "and small text may be unreadable. Call again with full_page=false to "
            "see the top of it at full size."
        )
    elif scale < 1.0:
        facts["scale"] = round(scale, 2)

    return image_result(png, f"Screenshot of the '{name}' dashboard:", **facts)


SCREENSHOT_TOOLS = {
    "screenshot_dashboard": Tool(
        name="screenshot_dashboard",
        description=(
            "Look at a dashboard as a person would see it, as an image. Use this "
            "after writing or changing a dashboard to check the result: whether "
            "charts overlap or are clipped, whether a row wrapped, whether a "
            "chart is empty, whether axis labels collided. The whole dashboard "
            "is captured, not just the first screen. Waits for any in-flight "
            "run so the charts have their data."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The dashboard to look at.",
                },
                "full_page": {
                    "type": "boolean",
                    "description": (
                        "The whole dashboard (default). Pass false for just the "
                        "first screen at full size, which is what to do when a "
                        "full-page capture came back too scaled down to read."
                    ),
                },
            },
            "required": ["name"],
        },
        handler=_screenshot_handler,
    ),
}
