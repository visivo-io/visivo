import os
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from visivo.models.dashboard import Dashboard
from visivo.models.project import Project
from visivo.logging.logger import Logger
from visivo.utils import sanitize_filename, get_dashboards_dir
from time import time
from click import ClickException


def get_thumbnail_path(dashboard_name: str, output_dir: str):
    safe_name = sanitize_filename(dashboard_name)
    thumbnail_dir = get_dashboards_dir(output_dir)
    os.makedirs(thumbnail_dir, exist_ok=True)
    return os.path.join(thumbnail_dir, f"{safe_name}.png")


def generate_thumbnail(dashboard: Dashboard, output_dir: str, timeout_ms: int, server_url: str):
    from playwright.sync_api import sync_playwright, TimeoutError

    thumbnail_path = get_thumbnail_path(dashboard.name, output_dir)

    with sync_playwright() as p:
        browser = p.webkit.launch()
        context = browser.new_context(viewport={"width": 1200, "height": 750})
        page = context.new_page()
        # URL encode the dashboard name to handle special characters
        from urllib.parse import quote

        encoded_dashboard_name = quote(dashboard.name)
        navigate_to = f"{server_url}/project/{encoded_dashboard_name}"
        # Navigate to dashboard
        Logger.instance().debug(f"   Navigating to {navigate_to}")
        page.goto(navigate_to)

        check_loading = """
            () => {
                const home = document.querySelectorAll('.visivo-home');
                if (home.length === 0) return { loaded: false, total: 0, loaded_count: 0, states: [], message: 'No root element found' };

                let loaders = document.querySelectorAll('.loading-spinner');
                if (loaders.length !== 0) return { loaded: false, total: 0, loaded_count: 0, states: [], message: 'No plots found' };
                
                const plots = document.querySelectorAll('.js-plotly-plot');
                // Then check their loading states
                const chartStates = Array.from(plots).map(plot => {
                    // Get the parent chart component
                    const chartComponent = plot.closest('[data-testid^="chart_"]');
                    const testId = chartComponent ? chartComponent.getAttribute('data-testid') : 'unknown';
                    
                    // Check if the plot has rendered its content
                    const hasPlotContent = plot.querySelector('.plot-container');
                    const isLoaded = hasPlotContent !== null;
                    
                    return {
                        testid: testId,
                        isLoaded: isLoaded,
                        hasPlotContent: hasPlotContent !== null
                    };
                });
                
                const loadedCount = chartStates.filter(s => s.isLoaded).length;
                
                loaders = document.querySelectorAll('.loading-spinner');
                if (loaders.length !== 0) return { loaded: false, total: 0, loaded_count: 0, states: [], message: 'No plots found' };

                return {
                    loaded: loadedCount === plots.length && loaders.length === 0,
                    total: plots.length,
                    loaded_count: loadedCount,
                    states: chartStates,
                    message: 'Checking plot loading states'
                };
            }
        """

        try:
            initial_state = page.evaluate(check_loading)
            Logger.instance().debug(f"Current page HTML: {page.content()}")
            Logger.instance().debug(
                f"Initial chart states: Total: {initial_state['total']}, Loaded: {initial_state['loaded_count']}, message: {initial_state['message']}"
            )
            for chart in initial_state["states"]:
                Logger.instance().debug(
                    f"Chart {chart['testid']}: {'loaded' if chart['isLoaded'] else 'loading'}"
                )

            # Wait for all charts to finish loading
            Logger.instance().debug(
                f"Waiting for charts to load on {dashboard.name}, current time: {time()}"
            )
            page.wait_for_function(
                """
                () => {
                    const state = (%s)();
                    return state.loaded;
                }
            """
                % check_loading,
                timeout=timeout_ms,
            )
            Logger.instance().debug(
                f"Done waiting for charts to load on {dashboard.name}, current time: {time()}"
            )
            # Wait for 350ms to ensure the page is fully loaded
            page.wait_for_timeout(200)
            # Log final state before screenshot
            final_state = page.evaluate(check_loading)
            Logger.instance().debug(
                f"Final chart states: Total: {final_state['total']}, Loaded: {final_state['loaded_count']}"
            )

            # Take screenshot
            page.screenshot(timeout=timeout_ms, path=thumbnail_path, type="png", full_page=False)
            # Resize the screenshot to 512 px wide while keeping the proportions
            from PIL import Image

            img = Image.open(thumbnail_path)
            img.thumbnail((512, 512), Image.Resampling.LANCZOS)
            img.save(thumbnail_path)

        except TimeoutError as e:
            # Get final state of charts before failing
            error_state = page.evaluate(check_loading)
            Logger.instance().error(
                f"Timeout waiting for charts to load. "
                f"Total charts: {error_state['total']}, "
                f"Loaded: {error_state['loaded_count']}. "
                f"Chart states: {error_state['states']}"
            )
            browser.close()
            raise Exception(f"Timeout waiting for dashboard to load: {str(e)}")
        except Exception as e:
            browser.close()
            raise e

        browser.close()
    return thumbnail_path


def action(
    dashboard: Dashboard,
    output_dir: str,
    thumbnail_mode: str,
    timeout_ms: int = 60000,
    server_url: str = None,
):
    Logger.instance().info(start_message("Dashboard", dashboard))
    start_time = time()

    try:
        thumbnail_path = get_thumbnail_path(dashboard.name, output_dir)

        # Skip if thumbnail exists and we're not forcing refresh
        if os.path.exists(thumbnail_path) and thumbnail_mode == "missing":
            success_message = format_message_success(
                details=f"Thumbnail already exists for dashboard \033[4m{dashboard.name}\033[0m",
                start_time=start_time,
                full_path=thumbnail_path,
            )
            return JobResult(item=dashboard, success=True, message=success_message)

        if not server_url:
            raise Exception("Cannot generate thumbnail when no server URL is provided")

        try:
            thumbnail_path = generate_thumbnail(dashboard, output_dir, timeout_ms, server_url)
        except Exception as e:
            if "BrowserType.launch: Executable doesn't exist" in str(e):
                Logger.instance().info(
                    "Missing playwright webkit browser. Running a one time install..."
                )
                import subprocess  # PR question: Is this the best way to do this? It works, but feels meh

                subprocess.run(["playwright", "install", "webkit"], check=True)
                # Retry with newly installed browser
                thumbnail_path = generate_thumbnail(dashboard, output_dir, timeout_ms, server_url)
            else:
                raise ClickException(
                    f"Error generating thumbnail for dashboard {dashboard.name}: {str(e)}"
                )

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
            full_path=thumbnail_path if "thumbnail_path" in locals() else None,
            error_msg=str(repr(e)),
        )
        return JobResult(item=dashboard, success=False, message=failure_message)


def job(
    dashboard: Dashboard,
    project: Project,
    output_dir: str,
    thumbnail_mode: str = None,
    server_url: str = None,
    timeout_ms: int = 60000,
) -> Job:
    return Job(
        item=dashboard,
        source=None,  # Thumbnails don't need a source
        action=action,
        dashboard=dashboard,
        output_dir=output_dir,
        thumbnail_mode=thumbnail_mode or "missing",
        server_url=server_url,
        timeout_ms=timeout_ms,
    )
