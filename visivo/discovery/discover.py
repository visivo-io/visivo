from visivo.utils import list_all_ymls_in_dir
import os


class Discover:
    def __init__(self, working_directory: str, home_directory=os.path.expanduser("~")):
        self.working_directory = working_directory
        self.home_directory = home_directory

    def files(self):
        home_ymls = list_all_ymls_in_dir(f"{self.home_directory}/.visivo")
        working_dir_ymls = list_all_ymls_in_dir(self.working_directory)
        return home_ymls + working_dir_ymls
