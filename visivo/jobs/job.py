from concurrent.futures import Future
from visivo.models.base.named_model import NamedModel
from visivo.models.sources.source import Source
import os
import re
import textwrap
from time import time
from termcolor import colored


class JobResult:
    def __init__(self, item: NamedModel, success: bool, message: str, warnings: list = None):
        self.item = item
        self.success = success
        self.message = message
        self.warnings = warnings or []


class CachedFuture:
    def __init__(self, item: NamedModel, message: str):
        self.item = item
        self.message = message

    def done(self):
        return True

    def result(self):
        return JobResult(item=self.item, success=True, message=self.message)


class Job:
    def __init__(
        self,
        item: NamedModel,
        source: Source,
        action,
        **kwargs,
    ):
        self.item = item
        self.source = source  # PR question: Why do we need this? It seems like it might some uneeded imports and runs - bumping this question (jared)
        self.action = action
        self.kwargs = kwargs  # These get passed to the action when it is run
        self.future: Future = None

    @property
    def name(self):
        return self.item.name

    def done(self):
        return self.future and self.future.done()

    def running(self):
        return self.future and not self.future.done()

    def set_future(self, future):
        self.future = future


def start_message(cls_name, item):
    return _format_message(
        details=f"Running job for {cls_name} \033[4m{item.name}\033[0m",
        status="RUNNING",
    )


def _format_message(details, status, full_path=None, error_msg=None):
    total_width = 100
    full_details = details

    # Helper function to strip ANSI codes for length calculation
    def strip_ansi(text):
        return re.sub(r"\033\[[0-9;]*m", "", text)

    # Check if verbose mode is enabled via environment variable
    verbose = os.environ.get("DEBUG", "").lower() == "true"

    if not verbose:
        # Apply truncation only in non-verbose mode
        # Truncate to 93 chars max (visual width, excluding ANSI codes)
        visual_width = len(strip_ansi(full_details))
        if visual_width > 93:
            # Need to truncate - find where to cut considering ANSI codes
            details = textwrap.shorten(strip_ansi(full_details), width=93, placeholder="(trunc)")
        else:
            details = full_details
    else:
        details = full_details

    # Add space after details
    details = details + " "

    # Calculate dots to align status based on visual length (excluding ANSI codes)
    visual_len = len(strip_ansi(details))
    num_dots = total_width - visual_len
    if num_dots > 0:
        dots = "." * num_dots
    else:
        # If details are longer than total_width, use minimal dots
        dots = " ... "

    error_str = "" if error_msg == None else f"\n\t\033[2merror: {error_msg}\033[0m"
    if not full_path:
        return f"{details}{dots}[{status}]{error_str}"

    current_directory = os.getcwd()
    relative_path = os.path.relpath(full_path, current_directory)
    action = ""
    if relative_path.endswith(".sql"):
        action = "query: "
    elif relative_path.endswith(".duckdb"):
        action = "database file: "

    return f"{details}{dots}[{status}]\n\t\033[2m{action}{relative_path}\033[0m{error_str}"


def format_message_success(details, start_time, full_path):
    status = colored(f"SUCCESS {round(time()-start_time,2)}s", "green")
    return _format_message(details=details, status=status, full_path=full_path)


def format_message_failure(details, start_time, full_path, error_msg):
    status = colored(f"FAILURE {round(time()-start_time,2)}s", "red")
    return _format_message(details=details, status=status, full_path=full_path, error_msg=error_msg)


def format_message_warning(details, start_time, full_path, warning_msg):
    status = colored(f"WARNING {round(time()-start_time,2)}s", "yellow")
    return _format_message(
        details=details, status=status, full_path=full_path, error_msg=warning_msg
    )
