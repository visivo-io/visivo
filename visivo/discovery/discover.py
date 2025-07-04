import os
import click
import fnmatch
import re
import glob
from pathlib import Path
from typing import List
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

    def __should_exclude_file(self, file_path: str, exclusions: List[str], base_path: str) -> bool:
        """Check if a file should be excluded based on exclusion patterns."""
        if not exclusions:
            return False

        # Get relative path from base_path for pattern matching
        try:
            rel_path = os.path.relpath(file_path, base_path)
        except ValueError:
            # If we can't get relative path, use the full path
            rel_path = file_path

        file_name = os.path.basename(file_path)

        for exclusion in exclusions:
            # Try different pattern matching approaches

            # 1. Direct filename match
            if exclusion == file_name:
                return True

            # 2. Glob pattern match on filename
            if fnmatch.fnmatch(file_name, exclusion):
                return True

            # 3. Glob pattern match on relative path
            if fnmatch.fnmatch(rel_path, exclusion):
                return True

            # 4. Unix-style path pattern (e.g., */config/*)
            unix_path = rel_path.replace(os.sep, "/")
            if fnmatch.fnmatch(unix_path, exclusion):
                return True

            # 5. Handle patterns like */temp/* by testing both with and without leading */
            if exclusion.startswith("*/"):
                # Try the pattern without the leading */
                pattern_without_prefix = exclusion[2:]  # Remove the */
                if fnmatch.fnmatch(unix_path, pattern_without_prefix):
                    return True
                # Also try matching any part of the path
                path_parts = unix_path.split("/")
                for i in range(len(path_parts)):
                    partial_path = "/".join(path_parts[i:])
                    if fnmatch.fnmatch(partial_path, pattern_without_prefix):
                        return True

            # 6. Try as regex pattern (catch any regex errors)
            try:
                if re.search(exclusion, rel_path) or re.search(exclusion, file_name):
                    return True
            except re.error:
                pass  # Invalid regex, skip

        return False

    def __find_yaml_files_in_directory(
        self, directory_path: str, depth: int = None, exclusions: List[str] = None
    ) -> List[str]:
        """Find YAML files in a directory with optional depth limit and exclusions."""
        yaml_files = []
        exclusions = exclusions or []

        if depth == 0:
            # Only search current directory
            for file in os.listdir(directory_path):
                file_path = os.path.join(directory_path, file)
                if os.path.isfile(file_path) and file.lower().endswith((".yml", ".yaml")):
                    if not self.__should_exclude_file(file_path, exclusions, directory_path):
                        yaml_files.append(file_path)
        else:
            # Recursive search with depth limit
            for root, dirs, files in os.walk(directory_path):
                # Calculate current depth
                current_depth = root[len(directory_path) :].count(os.sep)

                # If we have a depth limit and we've exceeded it, skip this level
                if depth is not None and current_depth >= depth:
                    dirs[:] = []  # Don't go deeper
                    continue

                # Check files in current directory
                for file in files:
                    if file.lower().endswith((".yml", ".yaml")):
                        file_path = os.path.join(root, file)
                        if not self.__should_exclude_file(file_path, exclusions, directory_path):
                            yaml_files.append(file_path)

                # Filter directories based on exclusions to avoid walking excluded paths
                dirs[:] = [
                    d
                    for d in dirs
                    if not self.__should_exclude_file(
                        os.path.join(root, d), exclusions, directory_path
                    )
                ]

        return sorted(yaml_files)  # Sort for consistent ordering

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

                # Handle Git repositories (existing functionality)
                if ".git" in include.path:
                    include_path = self.__get_project_file_from_git(git_url=include.path)
                    if not os.path.exists(include_path):
                        raise click.ClickException(
                            f'Invalid "include" in project. "{include_path}" referenced in "{file}" does not exist.'
                        )
                    files.append(Path(include_path))
                    self.__add_includes(files=files, file=include_path)
                    continue

                # Check if path exists
                if not os.path.exists(include_path):
                    raise click.ClickException(
                        f'Invalid "include" in project. "{include_path}" referenced in "{file}" does not exist.'
                    )

                # Handle directory inclusion
                if os.path.isdir(include_path):
                    yaml_files = self.__find_yaml_files_in_directory(
                        directory_path=include_path,
                        depth=include.depth,
                        exclusions=include.exclusions,
                    )

                    if not yaml_files:
                        # Optionally warn if no YAML files found in directory
                        click.echo(
                            f'Warning: No YAML files found in directory "{include_path}"', err=True
                        )

                    for yaml_file in yaml_files:
                        files.append(Path(yaml_file))
                        self.__add_includes(files=files, file=yaml_file)

                # Handle single file inclusion (existing functionality)
                else:
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
