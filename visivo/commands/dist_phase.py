from visivo.utils import DIST_PATH
from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash
import traceback


def _current_artifacts(json_paths):
    """One artifact per object name, dropping residue from older runs.

    `visivo run` writes each artifact as `<object_name>.json` (VIS-1128). It did
    NOT always: the previous scheme named them by `alpha_hash(name)`, and a run
    only ever ADDS files — it never removes the ones a rename or a scheme change
    orphaned. A project that predates VIS-1128 therefore has both on disk:

        target/main/insights/station-bubbles.json                 <- current
        target/main/insights/mifawvncyzdkmlywzcggvituhvlwb.json   <- residue

    Both carry `"name": "station-bubbles"`, so globbing the directory shipped
    every object TWICE in `insights.json` / `inputs.json`. The viewer took the
    first entry for a name — often the stale one — and asked for a parquet whose
    hashed filename no longer exists, so a hosted bundle 404'd on its own data
    and DuckDB reported `Table with name m… does not exist`.

    Serve never hit this: it reads objects through the managers, from the
    project. Only dist derived its manifest from whatever was lying in the
    directory.

    Resolution is by NAME, preferring the file whose stem matches the name it
    declares — that is exactly what distinguishes a current artifact from
    residue. When nothing matches (every candidate is from an older scheme), the
    most recently written one wins, so a bundle still gets built.
    """
    import json
    import os

    by_name = {}
    for path in sorted(json_paths):
        try:
            with open(path, "r") as f:
                data = json.load(f)
        except (OSError, ValueError):
            continue
        name = data.get("name")
        if not name:
            continue
        stem = os.path.splitext(os.path.basename(path))[0]
        current = by_name.get(name)
        if current is None:
            by_name[name] = (path, data, stem == name)
            continue
        _, _, current_is_named = current
        if current_is_named:
            continue
        if stem == name or os.path.getmtime(path) > os.path.getmtime(current[0]):
            by_name[name] = (path, data, stem == name)
    return [(path, data) for path, data, _ in by_name.values()]


def dist_phase(
    output_dir,
    dist_dir,
    working_dir: str = ".",
    default_source: str = None,
    dbt_profile: str = None,
    dbt_target: str = None,
    deployment_root: str = None,
):
    import os
    import json
    import shutil
    from glob import glob
    import datetime
    from visivo.utils import get_dashboards_dir
    from visivo.constants import DEFAULT_RUN_ID

    Logger.instance().info("Creating distribution for project in folder...")

    os.makedirs(f"{dist_dir}/data", exist_ok=True)

    deployment_root = deployment_root or ""

    try:
        # `dist` packages a previously-run project. The dereferenced project.json
        # is no longer written during compile/run, so generate it here (the only
        # consumer) by re-parsing and dereferencing. Require the run output to
        # exist first so we fail with a helpful message instead of shipping a
        # data-less bundle.
        run_dir = os.path.join(output_dir, DEFAULT_RUN_ID)
        if not os.path.isdir(run_dir):
            raise FileNotFoundError(
                f"No run output found at '{run_dir}'. Run `visivo run` before `visivo dist`."
            )

        from visivo.commands.parse_project_phase import parse_project_phase
        from visivo.parsers.serializer import Serializer

        project = parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source=default_source,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
        )
        project_json = json.loads(
            Serializer(project=project).dereference().model_dump_json(exclude_none=True)
        )

        dashboards_dir = get_dashboards_dir(output_dir)
        if os.path.exists(dashboards_dir):
            dist_dashboards_dir = os.path.join(dist_dir, "data", "dashboards")
            shutil.copytree(dashboards_dir, dist_dashboards_dir, dirs_exist_ok=True)
        created_at = datetime.datetime.now().isoformat()
        # Same canonical envelope the server serves at /api/project/, so the
        # viewer reads one shape in both modes. The whole blob stopped being
        # shipped in the bundle a while back; `project_json` survives for ONE
        # reason — it is the DEREFERENCED project, so a dashboard's
        # `${ref(chart)}` is expanded into the inline chart the per-dashboard
        # config below has to carry. Anything that doesn't need that expansion
        # reads the model directly.
        #
        # Every field here comes off the MODEL, exactly as
        # `data_views.projects_api` builds the same envelope. Nothing in it
        # needs dereferencing, and reading it out of `project_json` cost us a
        # crash: that dump is taken with `exclude_none=True`, so an optional
        # field left unset is not null in the JSON — it is ABSENT.
        # `project_json["name"]` therefore raised KeyError for any project
        # without a `name:`, which the schema allows (`NamedModel.name` is
        # Optional). The model always has the attribute.
        with open(f"{dist_dir}/data/project.json", "w") as f:
            f.write(
                json.dumps(
                    {
                        "id": "id",
                        "name": project.name,
                        "project_dir": project.project_dir or "",
                        "config": {
                            "defaults": (
                                project.defaults.model_dump(exclude_none=True, mode="json")
                                if project.defaults
                                else {}
                            )
                        },
                        "dashboard_count": len(project.dashboards or []),
                        "source_count": len(project.sources or []),
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

        # Copy parquet data files used by insights and inputs. The run writes
        # them into the directory named for what produced them (VIS-1128), but
        # dist stays FLAT: refs are rewritten to data/files/<basename> and the
        # viewer's dist mode reads them there. Names are globally unique within
        # a project, so flattening cannot collide.
        os.makedirs(f"{dist_dir}/data/files", exist_ok=True)
        for src_dir in ("models", "insights", "inputs"):
            files_src = os.path.join(run_dir, src_dir)
            if not os.path.isdir(files_src):
                continue
            for parquet_file in glob(f"{files_src}/*.parquet"):
                filename = os.path.basename(parquet_file)
                shutil.copyfile(parquet_file, f"{dist_dir}/data/files/{filename}")

        # Generate insights.json for dist mode
        insights_src = os.path.join(run_dir, "insights")
        insights_list = []
        if os.path.isdir(insights_src):
            os.makedirs(f"{dist_dir}/data/insights", exist_ok=True)
            for insight_file, insight_data in _current_artifacts(glob(f"{insights_src}/*.json")):
                insight_data["id"] = insight_data["name"]

                # Rewrite file URLs to dist paths
                if "files" in insight_data:
                    for file_ref in insight_data["files"]:
                        if "signed_data_file_url" in file_ref:
                            filename = os.path.basename(file_ref["signed_data_file_url"])
                            file_ref["signed_data_file_url"] = (
                                f"{deployment_root}/data/files/{filename}"
                            )

                # Write individual insight JSON keyed by clean name (the
                # source file is now named <insight_name>.json on disk).
                insight_filename = os.path.basename(insight_file)
                with open(f"{dist_dir}/data/insights/{insight_filename}", "w") as f:
                    json.dump(insight_data, f)

                insights_list.append(insight_data)

        with open(f"{dist_dir}/data/insights.json", "w") as f:
            json.dump(insights_list, f)

        # Generate inputs.json for dist mode
        inputs_src = os.path.join(run_dir, "inputs")
        inputs_list = []
        if os.path.isdir(inputs_src):
            os.makedirs(f"{dist_dir}/data/inputs", exist_ok=True)
            for input_file, input_data in _current_artifacts(glob(f"{inputs_src}/*.json")):
                input_data["id"] = input_data["name"]

                # Rewrite file URLs to dist paths
                if "files" in input_data:
                    for file_ref in input_data["files"]:
                        if "signed_data_file_url" in file_ref:
                            filename = os.path.basename(file_ref["signed_data_file_url"])
                            file_ref["signed_data_file_url"] = (
                                f"{deployment_root}/data/files/{filename}"
                            )

                # Write individual input JSON keyed by clean name (the source
                # file is now named <input_name>.json on disk).
                input_filename = os.path.basename(input_file)
                with open(f"{dist_dir}/data/inputs/{input_filename}", "w") as f:
                    json.dump(input_data, f)

                inputs_list.append(input_data)

        with open(f"{dist_dir}/data/inputs.json", "w") as f:
            json.dump(inputs_list, f)

        # Generate dashboard JSON files for dist mode (keyed by clean name —
        # thumbnails on disk are also named <dashboard_name>.png after the
        # storage refactor).
        #
        # Each entry mirrors the server's `/api/dashboards/` element shape
        # (`object_manager._serialize_object`): id / name / status / config,
        # plus the `signed_thumbnail_file_url` sibling the cards page reads.
        # `config` is the load-bearing key — it carries rows/items, and without
        # it the viewer has a dashboard's NAME but no layout to render.
        dashboards_list = []
        if "dashboards" in project_json:
            os.makedirs(f"{dist_dir}/data/dashboards", exist_ok=True)
            for dashboard in project_json["dashboards"]:
                dashboard_name = dashboard["name"]
                thumbnail_path = os.path.join(
                    dist_dir, "data", "dashboards", f"{dashboard_name}.png"
                )
                thumbnail_exists = os.path.exists(thumbnail_path)

                dashboard_data = {
                    "id": dashboard_name,
                    "name": dashboard_name,
                    # A dist bundle is a snapshot of committed state — nothing
                    # in it is a draft, so every dashboard reads as published.
                    "status": "published",
                    "config": dashboard,
                    "signed_thumbnail_file_url": (
                        f"{deployment_root}/data/dashboards/{dashboard_name}.png"
                        if thumbnail_exists
                        else None
                    ),
                }

                with open(f"{dist_dir}/data/dashboards/{dashboard_name}.json", "w") as f:
                    json.dump(dashboard_data, f)
                dashboards_list.append(dashboard_data)

        # The LIST endpoint. `/api/project/` stopped carrying the whole
        # dereferenced project ("Resource lists come from their own
        # endpoints" — data_views.py), and dist was never given an equivalent:
        # the viewer's dashboardStore called `dashboardsList`, which resolved
        # to null in the dist environment, so every static build rendered
        # "No dashboards found" no matter what the project contained.
        with open(f"{dist_dir}/data/dashboards.json", "w") as f:
            json.dump({"dashboards": dashboards_list}, f)

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
