from concurrent.futures import Future
from visivo.models.base.named_model import NamedModel
from visivo.models.sources.source import Source
import os
import textwrap
from time import time
from termcolor import colored


class JobResult:
    def __init__(self, success: bool, message: str):
        self.success = success
        self.message = message


class CachedFuture:
    def done(self):
        return True


class Job:
    def __init__(
        self,
        item: NamedModel,
        source: Source,
        action,
        output_changed: bool = True,
        **kwargs,
    ):
        self.item = item
        self.source = source
        self.action = action
        self.output_changed = output_changed
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
    total_width = 90

    details = textwrap.shorten(details, width=80, placeholder="(truncated)") + " "
    num_dots = total_width - len(details)
    dots = "." * num_dots
    if not full_path:
        return f"{details}{dots}[{status}]"
    current_directory = os.getcwd()
    relative_path = os.path.relpath(full_path, current_directory)
    error_str = "" if error_msg == None else f"\n\t\033[2merror: {error_msg}\033[0m"
    action = ""
    if relative_path.endswith(".sql"):
        action = "query: "
    elif relative_path.endswith(".sqlite"):
        action = "database file: "

    return (
        f"{details}{dots}[{status}]\n\t\033[2m{action}{relative_path}\033[0m"
        + error_str
    )


def format_message_success(details, start_time, full_path):
    status = colored(f"SUCCESS {round(time()-start_time,2)}s", "green")
    return _format_message(details=details, status=status, full_path=full_path)


def format_message_failure(details, start_time, full_path, error_msg):
    status = colored(f"FAILURE {round(time()-start_time,2)}s", "red")
    return _format_message(
        details=details, status=status, full_path=full_path, error_msg=error_msg
    )
