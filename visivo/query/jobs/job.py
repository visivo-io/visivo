from concurrent.futures import Future
from visivo.models.target import Target
import os
import textwrap


class Job:
    def __init__(self, name: str, target: Target, action, **kwargs):
        self.name = name
        self.target = target
        self.action = action
        self.kwargs = kwargs
        self.future: Future = None

    def set_future(self, future):
        self.future = future


def format_message(details, status, full_path, error_msg=None):
    total_width = 90

    details = textwrap.shorten(details, width=80, placeholder="(trucated)") + " "
    num_dots = total_width - len(details)
    dots = "." * num_dots
    current_directory = os.getcwd()
    relative_path = os.path.relpath(full_path, current_directory)
    error_str = "" if error_msg == None else f"\n\t\033[2merror: {error_msg}\033[0m"
    return (
        f"{details}{dots}[{status}]\n\t\033[2mquery: {relative_path}\033[0m" + error_str
    )
