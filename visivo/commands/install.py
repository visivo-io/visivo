import click
from visivo.logger.logger import Logger
import sys
import pathlib
from playwright.__main__ import main as playwright_main


@click.command()
def install():
    """Install required dependencies for Visivo."""
    Logger.instance().info("Installing Playwright dependencies...")

    marker = pathlib.Path.home() / ".playwright_webkit_installed"
    if not marker.exists():
        try:
            print("Installing Playwright WebKit...")
            print(marker)
            # Equivalent to `python -m playwright install webkit`
            sys.argv = ["playwright", "install", "webkit"]
            playwright_main()
            marker.touch()
        except Exception as e:
            print(f"Failed to install WebKit: {e}")
