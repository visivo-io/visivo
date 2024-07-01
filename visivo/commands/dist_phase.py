import pkg_resources

VIEWER_PATH = pkg_resources.resource_filename("visivo", "viewer/")


def dist_phase(output_dir, working_dir, default_target, name_filter, threads):
    from visivo.commands.run_phase import run_phase
    import os
    import json
    import shutil
    from glob import glob
    from visivo.logging.logger import Logger

    run_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_target=default_target,
        name_filter=name_filter,
        threads=threads,
    )

    os.makedirs("dist/data", exist_ok=True)
    with open(f"{output_dir}/project.json", "r") as f:
        project_json = json.load(f)
    with open(f"dist/data/project.json", "w") as f:
        f.write(json.dumps({"project_json": project_json}))

    trace_dirs = glob(f"{output_dir}/*/", recursive=True)
    for trace_dir in trace_dirs:
        trace_name = os.path.basename(os.path.normpath(trace_dir))
        if os.path.exists(f"{output_dir}/{trace_name}/data.json"):
            os.makedirs(f"dist/data/{trace_name}", exist_ok=True)
            shutil.copyfile(
                f"{output_dir}/{trace_name}/data.json",
                f"dist/data/{trace_name}/data.json",
            )

    shutil.copytree(VIEWER_PATH, "dist", dirs_exist_ok=True)
