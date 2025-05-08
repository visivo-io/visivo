import os
import click
from pathlib import Path
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.commands.utils import get_profile_file
from visivo.utils import load_yaml_file


class Discover:
    def __init__(
        self,
        working_dir: str,
        output_dir: str,
        home_dir=os.path.expanduser("~"),
    ):
        self.working_dir = working_dir
        self.home_dir = home_dir
        self.output_dir = output_dir

    @property
    def project_file(self):
        return Path(self._get_any_project_file(self.working_dir))

    @property
    def files(self):
        if not os.path.exists(self.project_file):
            raise click.ClickException(f'Project file "{PROJECT_FILE_NAME}" not found')
        files = [self.project_file]

        self.__add_includes(files=files, file=self.project_file)

        profile_file = get_profile_file(home_dir=self.home_dir)
        if os.path.exists(profile_file):
            files.append(profile_file)

        return files

    def __add_dbt(self, data):
        from visivo.models.dbt import Dbt

        if "dbt" in data and data["dbt"]:
            dbt = Dbt(**data["dbt"])
            if dbt.enabled:
                return dbt.get_output_file(output_dir=self.output_dir, working_dir=self.working_dir)

    def __add_includes(self, files, file):
        from visivo.models.include import Include

        data = load_yaml_file(file)
        base_path = os.path.dirname(file)

        output_file = self.__add_dbt(data=data)
        if output_file and os.path.exists(output_file):
            files.append(Path(output_file))

        if "includes" in data:
            for include_data in data["includes"]:
                include = Include(**include_data)
                include_path = f"{base_path}/{include.path}"
                if ".git" in include.path:
                    include_path = self.__get_project_file_from_git(git_url=include.path)

                if not os.path.exists(include_path):
                    raise click.ClickException(
                        f'Invalid "include" in project. "{include_path}" referenced in "{file}" does not exist.'
                    )
                files.append(Path(include_path))
                self.__add_includes(files=files, file=include_path)

    def _get_any_project_file(self, dir):
        if os.path.exists(f"{dir}/visivo_project.yml"):
            return f"{dir}/visivo_project.yml"

        return f"{dir}/{PROJECT_FILE_NAME}"

    def __get_project_file_from_git(self, git_url):
        from git import Repo

        deps_folder = f"{self.working_dir}/.visivo_cache"
        if not os.path.exists(deps_folder):
            os.makedirs(deps_folder)
        if "@" not in git_url:
            raise click.ClickException(
                f'Invalid github dependency "{git_url}". A version specified with "@" is required'
            )

        repo_url = f"https://github.com/{git_url.split('@')[0]}"
        version = git_url.split("@")[1]
        if "--" in version:
            file = version.split("--")[1].strip()
            version = version.split("--")[0].strip()
        else:
            file = None

        local_folder = f"{deps_folder}/{git_url.split('@')[0].replace('.git', '')}@{version}"
        if os.path.exists(local_folder):
            repo = Repo(local_folder)
        else:
            repo = Repo.clone_from(repo_url, local_folder)

        try:
            repo.git.checkout(version)
        except Exception as e:
            repo.close()
            raise click.ClickException(f'Error cloning "{git_url}": {e}')

        if file:
            return f"{local_folder}/{file}"

        return self._get_any_project_file(local_folder)
