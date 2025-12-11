from visivo.utils import DIST_PATH
from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash
import traceback


def dist_phase(output_dir, dist_dir, deployment_root: str = None):
    import os
    import json
    import shutil
    from glob import glob
    import datetime
    from visivo.utils import get_dashboards_dir

    Logger.instance().info("Creating distribution for project in folder...")

    os.makedirs(f"{dist_dir}/data", exist_ok=True)

    deployment_root = deployment_root or ""

    try:
        dashboards_dir = get_dashboards_dir(output_dir)
        if os.path.exists(dashboards_dir):
            dist_dashboards_dir = os.path.join(dist_dir, "data", "dashboards")
            shutil.copytree(dashboards_dir, dist_dashboards_dir, dirs_exist_ok=True)

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

        # Copy explorer.json if it exists
        if os.path.exists(f"{output_dir}/explorer.json"):
            shutil.copyfile(f"{output_dir}/explorer.json", f"{dist_dir}/data/explorer.json")

        # Generate traces.json for dist mode

        trace_dirs = glob(f"{output_dir}/traces/*/", recursive=True)
        traces_list = []
        os.makedirs(f"{dist_dir}/data/traces", exist_ok=True)

        for trace_dir in trace_dirs:
            trace_name = os.path.basename(os.path.normpath(trace_dir))
            if os.path.exists(f"{output_dir}/traces/{trace_name}/data.json"):
                # Create hash-based filename for trace data
                trace_name_hash = alpha_hash(trace_name)
                shutil.copyfile(
                    f"{output_dir}/traces/{trace_name}/data.json",
                    f"{dist_dir}/data/traces/{trace_name_hash}.json",
                )
                # Add trace info for traces.json
                traces_list.append(
                    {
                        "name": trace_name,
                        "id": trace_name,
                        "signed_data_file_url": f"{deployment_root}/data/traces/{trace_name_hash}.json",
                    }
                )

        # Write traces.json
        with open(f"{dist_dir}/data/traces.json", "w") as f:
            json.dump(traces_list, f)

        # Generate dashboard JSON files for dist mode
        if "dashboards" in project_json:
            os.makedirs(f"{dist_dir}/data/dashboards", exist_ok=True)
            for dashboard in project_json["dashboards"]:
                dashboard_name = dashboard["name"]
                dashboard_name_hash = alpha_hash(dashboard_name)
                thumbnail_path = os.path.join(
                    dist_dir, "data", "dashboards", f"{dashboard_name_hash}.png"
                )
                thumbnail_exists = os.path.exists(thumbnail_path)

                dashboard_data = {
                    "id": dashboard_name,
                    "name": dashboard_name,
                    "signed_thumbnail_file_url": (
                        f"{deployment_root}/data/dashboards/{dashboard_name_hash}.png"
                        if thumbnail_exists
                        else None
                    ),
                }

                # Write individual dashboard JSON file using hash-based filename
                with open(f"{dist_dir}/data/dashboards/{dashboard_name_hash}.json", "w") as f:
                    json.dump(dashboard_data, f)

        shutil.copytree(DIST_PATH, dist_dir, dirs_exist_ok=True)

        index_html_path = os.path.join(dist_dir, "index.html")
        Logger.instance().info(f"Setting deployment root to {deployment_root} in index.html")
        if os.path.exists(index_html_path):
            with open(index_html_path, "r") as f:
                content = f.read()

            content = content.replace(
                "window.deploymentRoot = '';",
                f"window.deploymentRoot = '{deployment_root}';",
            )
            content = content.replace(
                'href="/',
                f'href="{deployment_root}/',
            )
            content = content.replace(
                'src="/',
                f'src="{deployment_root}/',
            )

            with open(index_html_path, "w") as f:
                f.write(content)

            site_webmanifest_path = os.path.join(dist_dir, "site.webmanifest")
            if os.path.exists(site_webmanifest_path):
                with open(site_webmanifest_path, "r") as f:
                    content = f.read()
                content = content.replace(
                    '"src": "/',
                    f'"src": "{deployment_root}/',
                )

                with open(site_webmanifest_path, "w") as f:
                    f.write(content)
    except Exception as e:
        Logger.instance().error(
            f"Error creating dist. Try running `visivo run` to ensure your project is up to date."
        )
        Logger.instance().error(f"Message: {e}, set STACKTRACE=true to see full error")
        if os.environ.get("STACKTRACE"):
            Logger.instance().error(f"{traceback.format_exc()}")
            raise e
