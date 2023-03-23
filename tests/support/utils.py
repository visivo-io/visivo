from pathlib import Path
from sqlalchemy import create_engine, MetaData, Table, Integer, Column, insert, String
import yaml
import uuid
import os


def temp_folder():
    return f"tmp/{str(uuid.uuid1())}"


def temp_yml_file(dict, name=str(uuid.uuid1()) + ".yml"):
    path = f"tmp/{str(uuid.uuid1())}/{name}"
    folders = os.path.dirname(path)
    os.makedirs(folders, exist_ok=True)

    fp = open(path, "w")
    fp.write(yaml.dump(dict))
    fp.close()

    return Path(path)


def create_file_database(url, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    engine = create_engine(url, echo=True)
    metadata_obj = MetaData()
    table = Table(
        "test_table",
        metadata_obj,
        Column("x", Integer),
        Column("y", Integer),
    )
    metadata_obj.create_all(engine)
    for v in [[1, 1], [2, 1], [3, 2], [4, 3], [5, 5], [6, 8]]:
        with engine.connect() as connection:
            connection.execute(insert(table).values(x=v[0], y=v[1]))
            connection.commit()
