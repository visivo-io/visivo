import os
from visivo.query.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from visivo.models.dashboard import Dashboard
from visivo.models.project import Project
from visivo.logging.logger import Logger
from visivo.utils import sanitize_filename
from time import time
from click import ClickException
from visivo.utils import VIEWER_PATH


def get_thumbnail_path(dashboard_name: str, output_dir: str):
    safe_name = sanitize_filename(dashboard_name)
    thumbnail_dir = os.path.join(output_dir, "dashboard-thumbnails")
    os.makedirs(thumbnail_dir, exist_ok=True)
    return os.path.join(thumbnail_dir, f"{safe_name}.png")


def generate_thumbnail(dashboard: Dashboard, output_dir: str, timeout_ms: int, server_url: str):
    from playwright.sync_api import sync_playwright
    thumbnail_path = get_thumbnail_path(dashboard.name, output_dir)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1200, 'height': 750})
        page = context.new_page()
        # URL encode the dashboard name to handle special characters
        from urllib.parse import quote
        encoded_dashboard_name = quote(dashboard.name)
        # Navigate to dashboard
        page.goto(f"{server_url}/{encoded_dashboard_name}")
        
        # Wait for dashboard to load and render
        page.wait_for_selector(".dashboard-row", timeout=timeout_ms)
        page.wait_for_timeout(1000)  #TODO: Replace this with a wait based on the actual item loading
        
        # Take screenshot
        page.screenshot(
            timeout=timeout_ms,
            path=thumbnail_path,
            type='png',
            full_page=False
        )
        
        browser.close()
    return thumbnail_path


def action(
        dashboard: Dashboard, 
        output_dir: str, 
        thumbnail_mode: str, 
        timeout_ms: int = 30000, 
        server_url: str = None
    ):
    Logger.instance().info(start_message("Dashboard", dashboard))
    start_time = time()
    
    try:
        thumbnail_path = get_thumbnail_path(dashboard.name, output_dir)
        
        # Skip if thumbnail exists and we're not forcing refresh
        if os.path.exists(thumbnail_path) and thumbnail_mode == 'missing':
            success_message = format_message_success(
                details=f"Thumbnail already exists for dashboard \033[4m{dashboard.name}\033[0m",
                start_time=start_time,
                full_path=thumbnail_path,
            )
            return JobResult(item=dashboard, success=True, message=success_message)

        try:
            thumbnail_path = generate_thumbnail(dashboard, output_dir, timeout_ms, server_url)
        except Exception as e:
            if "BrowserType.launch: Executable doesn't exist" in str(e):
                Logger.instance().info("Installing Playwright browser...")
                import subprocess #PR question: Is this the best way to do this? It works, but feels meh
                subprocess.run(["playwright", "install", "chromium"], check=True)
                # Retry with newly installed browser
                thumbnail_path = generate_thumbnail(dashboard, output_dir, timeout_ms, server_url)
            else:
                raise ClickException(f"Error generating thumbnail for dashboard {dashboard.name}: {str(e)}")

        success_message = format_message_success(
            details=f"Generated thumbnail for dashboard \033[4m{dashboard.name}\033[0m",
            start_time=start_time,
            full_path=thumbnail_path,
        )
        return JobResult(item=dashboard, success=True, message=success_message)

    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed to generate thumbnail for dashboard \033[4m{dashboard.name}\033[0m",
            start_time=start_time,
            full_path=thumbnail_path if 'thumbnail_path' in locals() else None,
            error_msg=str(repr(e)),
        )
        return JobResult(item=dashboard, success=False, message=failure_message)


def job(
    dashboard: Dashboard, 
    project: Project, 
    output_dir: str, 
    thumbnail_mode: str = None, 
    server_url: str = None
    ) -> Job:
    return Job(
        item=dashboard,
        source=None,  # Thumbnails don't need a source
        action=action,
        dashboard=dashboard,
        output_dir=output_dir,
        thumbnail_mode=thumbnail_mode or 'missing',
        server_url=server_url,
    ) 
