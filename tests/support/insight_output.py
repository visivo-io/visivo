import json
import os

from visivo.jobs.parquet_io import write_dicts_to_parquet


def write_insight_output(output_dir, name, props, static_props=None, run_id="main"):
    """Writes what `visivo run` writes for a static-query insight: `insights/<name>.json`
    plus its parquet, with each prop bound to a hashed column name."""
    insights_dir = os.path.join(output_dir, run_id, "insights")
    os.makedirs(insights_dir, exist_ok=True)
    columns = {prop: f"col_{index}" for index, prop in enumerate(props)}
    length = len(next(iter(props.values()))) if props else 0
    rows = [{columns[prop]: values[i] for prop, values in props.items()} for i in range(length)]
    parquet_path = os.path.join(insights_dir, f"{name}.parquet")
    write_dicts_to_parquet(rows, parquet_path)
    info = {
        "name": name,
        "files": [{"name_hash": f"hash_{name}", "signed_data_file_url": parquet_path}],
        "query": f'SELECT * FROM "hash_{name}"',
        "props_mapping": columns,
        "static_props": static_props or {},
        "props_slices": {},
        "split_key": None,
        "type": "scatter",
    }
    with open(os.path.join(insights_dir, f"{name}.json"), "w") as file:
        json.dump(info, file)
