import importlib.resources as resources

VIEWER_PATH = resources.files("visivo") / "viewer"


def dist_phase(output_dir, working_dir, dist_dir, default_source, name_filter, threads):
    from visivo.commands.run_phase import run_phase
    import os
    import json
    import shutil
    from glob import glob
    import datetime

    run_phase(
        output_dir=output_dir,
        working_dir=working_dir,
        default_source=default_source,
        name_filter=name_filter,
        threads=threads,
    )

    os.makedirs(f"{dist_dir}/data", exist_ok=True)
    with open(f"{output_dir}/project.json", "r") as f:
        project_json = json.load(f)
    created_at = (datetime.datetime.now().isoformat(),)
    with open(f"{dist_dir}/data/project.json", "w") as f:
        f.write(
            json.dumps(
                {
                    "project_json": project_json,
                    "created_at": created_at,
                }
            )
        )
    with open(f"{dist_dir}/data/error.json", "w") as f:
        f.write(json.dumps({}))
    with open(f"{dist_dir}/data/project_history.json", "w") as f:
        f.write(json.dumps([{"created_at": created_at, "id": "id"}]))

    trace_dirs = glob(f"{output_dir}/*/", recursive=True)
    for trace_dir in trace_dirs:
        trace_name = os.path.basename(os.path.normpath(trace_dir))
        if os.path.exists(f"{output_dir}/{trace_name}/data.json"):
            os.makedirs(f"{dist_dir}/data/{trace_name}", exist_ok=True)
            shutil.copyfile(
                f"{output_dir}/{trace_name}/data.json",
                f"{dist_dir}/data/{trace_name}/data.json",
            )

    shutil.copytree(VIEWER_PATH, dist_dir, dirs_exist_ok=True)
