def _generate_sources(profiles):
    from visivo.logging.logger import Logger

    sources = []
    for profile_name, profile_value in profiles.items():
        for target_name, target_value in profile_value["outputs"].items():
            source = target_value
            source["name"] = f"dbt_{profile_name}_{target_name}"
            if "schema" in source:
                source["db_schema"] = source.pop("schema")
            if "user" in source:
                source["username"] = source.pop("user")
            if "type" in source and source["type"] == "snowflake":
                Logger.instance().info(
                    f"Configuring threads for snowflake is not supported.  Ignoring."
                )
                if "threads" in source:
                    source.pop("threads")
            sources.append(source)

    return sources


def _generate_models(manifest):
    models = []
    if "nodes" in manifest:
        for path, node in manifest["nodes"].items():
            if path.startswith("model."):
                names = []
                if "database" in node:
                    names.append(node["database"])
                if "schema" in node:
                    names.append(node["schema"])
                names.append(node["name"])
                model = {
                    "name": f"dbt_{node['name']}",
                    "sql": "select * from " + ".".join(names),
                }

                models.append(model)

    return models


def dbt_phase(working_dir, output_dir):
    from .utils import parse_project_file

    project = parse_project_file(working_dir, None)

    dbt_properties = project.dbt
    if dbt_properties:
        from visivo.logging.logger import Logger

        dbt_root = working_dir
        if dbt_properties.dbt_project_yml_location:
            dbt_root = f"{working_dir}/{dbt_properties.dbt_project_yml_location}"
        dbt_project_file = f"{dbt_root}/dbt_project.yml"

        profiles_file = f"{working_dir}/profiles.yml"
        if dbt_properties.profiles_yml_location:
            profiles_file = (
                f"{working_dir}/{dbt_properties.profiles_yml_location}/profiles.yml"
            )

        Logger.instance().debug(f"Found dbt_project file: {dbt_project_file}")
        Logger.instance().debug(f"Found profiles file: {profiles_file}")

        import yaml
        import json

        with open(dbt_project_file, "r") as file:
            dbt_project = yaml.safe_load(file)

        with open(profiles_file, "r") as file:
            profiles = yaml.safe_load(file)

        with open(
            f"{dbt_root}/{dbt_project['target-path']}/manifest.json", "r"
        ) as file:
            manifest = json.load(file)

        sources = _generate_sources(profiles)
        models = _generate_models(manifest)

        output_file = f"{output_dir}/dbt.yml"
        if dbt_properties.output_file:
            output_file = f"{working_dir}/{dbt_properties.output_file}"

        with open(output_file, "w") as file:
            yaml.dump({"sources": sources, "models": models}, file)

        Logger.instance().info(f"Refreshed dbt models and sources.")
