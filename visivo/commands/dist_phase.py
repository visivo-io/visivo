from visivo.utils import DIST_PATH
from visivo.logging.logger import Logger
import traceback


def dist_phase(output_dir, dist_dir):
    import os
    import json
    import shutil
    from glob import glob
    import datetime
    from visivo.utils import get_dashboards_dir

    Logger.instance().info("Creating distribution for project in folder...")

    os.makedirs(f"{dist_dir}/data", exist_ok=True)

    try:
        thumbnail_dir = get_dashboards_dir(output_dir)
        if os.path.exists(thumbnail_dir):
            dist_thumbnail_dir = os.path.join(dist_dir, "data", "dashboards")
            shutil.copytree(thumbnail_dir, dist_thumbnail_dir, dirs_exist_ok=True)

        with open(f"{output_dir}/project.json", "r") as f:
            project_json = json.load(f)
        created_at = (datetime.datetime.now().isoformat(),)
        with open(f"{dist_dir}/data/project.json", "w") as f:
            f.write(
                json.dumps(
                    {
                        "id": "id",
                        "project_json": project_json,
                        "created_at": created_at,
                    }
                )
            )
        with open(f"{dist_dir}/_redirects", "w") as f:
            f.write("/*    /index.html   200")

        with open(f"{dist_dir}/data/error.json", "w") as f:
            f.write(json.dumps({}))
        with open(f"{dist_dir}/data/project_history.json", "w") as f:
            f.write(json.dumps([{"created_at": created_at, "id": "id"}]))

        trace_dirs = glob(f"{output_dir}/traces/*/", recursive=True)
        for trace_dir in trace_dirs:
            trace_name = os.path.basename(os.path.normpath(trace_dir))
            if os.path.exists(f"{output_dir}/traces/{trace_name}/data.json"):
                os.makedirs(f"{dist_dir}/data/{trace_name}", exist_ok=True)
                shutil.copyfile(
                    f"{output_dir}/traces/{trace_name}/data.json",
                    f"{dist_dir}/data/{trace_name}/data.json",
                )

        shutil.copytree(DIST_PATH, dist_dir, dirs_exist_ok=True)
    except Exception as e:
        Logger.instance().error(
            f"Error creating dist. Try running `visivo run` to ensure your project is up to date."
        )
        Logger.instance().error(f"Message: {e}, set STACKTRACE=true to see full error")
        if os.environ.get("STACKTRACE"):
            Logger.instance().error(f"{traceback.format_exc()}")
            raise e
