import click
from visivo.logging.logger import Logger
import subprocess
import sys


@click.command()
def install():
    """Install required dependencies for Visivo."""
    Logger.instance().info("Installing Playwright dependencies...")
    try:
        subprocess.run(
            [sys.executable, "-m", "playwright", "install", "webkit", "--with-deps"], check=True
        )
        Logger.instance().info("Successfully installed Playwright dependencies!")
    except subprocess.CalledProcessError as e:
        Logger.instance().error(f"Failed to install Playwright dependencies: {str(e)}")
        sys.exit(1)
