from visivo.logger.logger import Logger


def _generate_sources(profiles, dbt_target, dbt_prefix):
    import click
    from visivo.commands.utils import get_source_types

    source_types = get_source_types()
    sources = []
    target_found = False
    for profile_name, profile_value in profiles.items():
        for target_name, target_value in profile_value["outputs"].items():
            if target_name == dbt_target:
                target_found = True
            source = target_value
            source["name"] = f"{dbt_prefix}{profile_name}_{target_name}"
            if "path" in source and source.get("type") == "duckdb":
                source["database"] = source.pop("path")
            if "dbname" in source:
                source["database"] = source.pop("dbname")
            if "schema" in source:
                source["db_schema"] = source.pop("schema")
            if "user" in source:
                source["username"] = source.pop("user")
            if "threads" in source:
                source.pop("threads")

            allowed_keys = [
                "account",
                "connection_pool_size",
                "credentials_base64",
                "database",
                "db_schema",
                "host",
                "name",
                "password",
                "port",
                "private_key_path",
                "private_key_passphrase",
                "project",
                "role",
                "timezone",
                "type",
                "username",
                "warehouse",
            ]
            for key in list(source.keys()):
                if key not in allowed_keys:
                    source.pop(key)
            if "type" in source and source["type"] not in source_types:
                raise click.ClickException(
                    f"Target type '{source['type']}' is not supported.  Only {source_types} are supported."
                )
            Logger.instance().debug(
                f"dbt target {target_name} in profile {profile_name} is now source: {source['name']}"
            )
            sources.append(source)

    if not target_found:
        raise click.ClickException(f"Target '{dbt_target}' not found in profiles.yml")

    return sources


def _generate_models(manifest, dbt_profile, dbt_target, dbt_prefix):
    models = []
    if "nodes" in manifest:
        for path, node in manifest["nodes"].items():
            if path.startswith("model."):
                names = []
                if "database" in node:
                    names.append(node["database"])
                if "schema" in node:
                    names.append(node["schema"])
                name = node["name"]
                version = None
                latest_version = None
                if "version" in node and node["version"]:
                    version = node["version"]
                if "latest_version" in node and node["latest_version"]:
                    latest_version = node["latest_version"]

                if version:
                    name = f"{name}_v{version}"
                names.append(name)

                model = {
                    "name": f"{dbt_prefix}{name}",
                    "sql": "select * from " + ".".join(names),
                    "source": f"ref({dbt_prefix}{dbt_profile}_{dbt_target})",
                }
                if version and version == latest_version:
                    models.append(
                        {
                            "name": f"{dbt_prefix}{node['name']}",
                            "sql": "select * from " + ".".join(names),
                            "source": f"ref({dbt_prefix}{dbt_profile}_{dbt_target})",
                        }
                    )

                models.append(model)

    return models


def dbt_phase(working_dir, output_dir, dbt_profile, dbt_target):
    from visivo.logger.logger import Logger
    from visivo.parsers.parser_factory import ParserFactory
    from visivo.discovery.discover import Discover
    from visivo.models.project import Dbt
    import os
    import click

    discover = Discover(working_dir=working_dir, output_dir=output_dir)
    parser = ParserFactory().build(project_file=discover.project_file, files=discover.files)
    data = parser.merge_data_files()
    if "dbt" in data and data["dbt"]:
        dbt = Dbt(**data["dbt"])
    else:
        dbt = None

    if dbt and dbt.enabled:
        dbt_root = working_dir
        if dbt.dbt_project_yml_location:
            dbt_root = f"{working_dir}/{dbt.dbt_project_yml_location}"
        dbt_project_file = f"{dbt_root}/dbt_project.yml"
        if not os.path.exists(dbt_project_file):
            raise click.ClickException(f"dbt_project.yml file not found at '{dbt_project_file}'")

        profiles_file = f"{working_dir}/profiles.yml"
        if dbt.profiles_yml_location:
            profiles_file = f"{working_dir}/{dbt.profiles_yml_location}/profiles.yml"

        if not os.path.exists(profiles_file):
            raise click.ClickException(f"profiles.yml file not found at '{profiles_file}'")

        Logger.instance().debug(f"Found dbt_project file: {dbt_project_file}")
        Logger.instance().debug(f"Found profiles file: {profiles_file}")

        import json
        import ruamel.yaml

        yaml = ruamel.yaml.YAML()
        yaml.preserve_quotes = True

        with open(dbt_project_file, "r") as file:
            dbt_project = yaml.load(file)

        with open(profiles_file, "r") as file:
            profiles = yaml.load(file)

        if not dbt_profile and "profile" in dbt_project:
            dbt_profile = dbt_project["profile"]

        if dbt_profile not in profiles:
            raise click.ClickException(f"Profile '{dbt_profile}' not found in profiles.yml")
        if not dbt_target:
            dbt_target = profiles[dbt_profile]["target"]

        manifest_file = f"{dbt_root}/{dbt_project['target-path']}/manifest.json"
        if not os.path.exists(manifest_file):
            raise click.ClickException(
                f"Manifest file not found at '{manifest_file}'. You might need to 'dbt compile'."
            )
        with open(manifest_file, "r") as file:
            manifest = json.load(file)

        prefix = f"{dbt.prefix}_" if dbt.prefix else ""
        sources = _generate_sources(profiles, dbt_target, prefix)
        models = _generate_models(manifest, dbt_profile, dbt_target, prefix)

        output_file = dbt.get_output_file(output_dir=output_dir, working_dir=working_dir)

        output_dir_path = os.path.dirname(output_file)
        if not os.path.exists(output_dir_path):
            os.makedirs(output_dir_path)
        with open(output_file, "w") as file:
            yaml.dump({"sources": sources, "models": models}, file)

        models_written = ", ".join([model["name"] for model in models])
        relative_output_file = os.path.relpath(output_file, working_dir)
        Logger.instance().debug(
            f"dbt base visivo models written to {relative_output_file}: {models_written}"
        )
        sources_written = ", ".join([source["name"] for source in sources])
        Logger.instance().debug(
            f"dbt base visivo sources written to {relative_output_file}: {sources_written}"
        )
    else:
        Logger.instance().debug(f"dbt is not enabled.")
