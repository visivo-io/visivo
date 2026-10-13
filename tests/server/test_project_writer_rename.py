"""`Renamed` — writing an object over the entry the YAML still holds.

The one status whose object is NOT found under the name it is keyed by. Every
other one matches `name:` against the key; a renamed object is in the file under
its old name, so `_update` would search for something that isn't there, find
nothing, and return quietly. The commit still succeeds and the change is gone.

That makes this the branch most worth pinning and, until now, the only one with
no test. It is reached from two places that cannot exercise each other: the
local commit (`ObjectManager.record_rename` -> `_renamed_child_args`) and a
cloud commit, where core sends the map over the wire from `previous_name`
(VIS-1350) and the runner hands it here. The maps below are the shape core
actually sends, so a change on either side of that seam fails here.
"""

import pytest
import ruamel.yaml

from visivo.server.project_writer import ProjectWriter
from tests.support.utils import temp_file, temp_folder

YAML_WITH_COMMENTS = """\
name: analytics

sources:
  - name: warehouse
    type: postgresql

models:
  - name: orders          # one row per order
    source: ${ref(warehouse)}
    sql: select * from public.orders
"""


def _project_file(contents=YAML_WITH_COMMENTS, name="project.visivo.yml"):
    return str(temp_file(name, contents, output_dir=temp_folder()))


def _written(writer, path):
    """The file as the writer would leave it on disk."""
    writer.write()
    with open(path) as handle:
        return handle.read()


def _renamed(path, *, old_name, config, type_key="models"):
    return {
        config["name"]: {
            "status": "Renamed",
            "old_name": old_name,
            "type_key": type_key,
            "config": config,
            "file_path": path,
            "new_file_path": path,
        }
    }


def test_it_writes_over_the_entry_the_file_still_holds():
    path = _project_file()
    writer = ProjectWriter(
        _renamed(
            path,
            old_name="orders",
            config={
                "name": "sales",
                "source": "${ref(warehouse)}",
                "sql": "select * from public.orders",
            },
        )
    )

    writer.update_file_contents()

    models = writer.files_to_write[path]["models"]
    assert [model["name"] for model in models] == ["sales"]


def test_the_object_is_not_duplicated():
    """The failure this exists to prevent: the old entry left behind and the new
    one appended, giving a project two objects where the author has one."""
    path = _project_file()
    writer = ProjectWriter(
        _renamed(path, old_name="orders", config={"name": "sales", "sql": "select 1"})
    )

    writer.update_file_contents()

    assert len(writer.files_to_write[path]["models"]) == 1


def test_the_authors_comments_and_spacing_survive():
    """A rename edits the file in place — it does not regenerate it. Losing a
    comment would turn a one-line rename into an unreviewable diff."""
    path = _project_file()
    writer = ProjectWriter(
        _renamed(
            path,
            old_name="orders",
            config={
                "name": "sales",
                "source": "${ref(warehouse)}",
                "sql": "select * from public.orders",
            },
        )
    )

    writer.update_file_contents()
    text = _written(writer, path)

    assert "# one row per order" in text
    assert "name: sales" in text
    assert "name: orders" not in text
    # Untouched objects are left exactly as they were.
    assert "name: warehouse" in text


def test_what_it_writes_is_still_loadable_yaml():
    path = _project_file()
    writer = ProjectWriter(
        _renamed(
            path,
            old_name="orders",
            config={"name": "sales", "sql": "select * from public.orders"},
        )
    )

    writer.update_file_contents()
    loaded = ruamel.yaml.YAML(typ="safe").load(_written(writer, path))

    assert loaded["models"][0]["name"] == "sales"


def test_it_finds_the_object_in_a_file_of_its_own():
    """Objects do not have to live in the project file, and the rename is
    written wherever the object actually is."""
    path = _project_file(
        contents=(
            "models:\n"
            "  - name: orders     # the grain\n"
            "    sql: select * from public.orders\n"
        ),
        name="orders.visivo.yml",
    )
    writer = ProjectWriter(
        _renamed(path, old_name="orders", config={"name": "sales", "sql": "select 1"})
    )

    writer.update_file_contents()
    text = _written(writer, path)

    assert "name: sales" in text
    assert "# the grain" in text


def test_only_the_renamed_objects_own_entry_is_touched():
    """Every `${ref(orders)}` elsewhere belongs to a DIFFERENT object whose
    config genuinely changed, so those arrive as ordinary `Modified` children.
    This must not go looking for them."""
    path = _project_file(
        contents=(
            "models:\n"
            "  - name: orders\n"
            "    sql: select 1\n"
            "  - name: joined\n"
            "    sql: select * from ${ref(orders)} o\n"
        )
    )
    writer = ProjectWriter(
        _renamed(path, old_name="orders", config={"name": "sales", "sql": "select 1"})
    )

    writer.update_file_contents()

    models = writer.files_to_write[path]["models"]
    assert [model["name"] for model in models] == ["sales", "joined"]
    assert models[1]["sql"] == "select * from ${ref(orders)} o"


def test_a_rename_the_file_never_heard_of_changes_nothing():
    """`old_name` is core's claim about what the repo holds, and the repo can
    have moved on. Writing the object in anyway would append a duplicate; doing
    nothing leaves the file exactly as the author has it."""
    path = _project_file()
    writer = ProjectWriter(_renamed(path, old_name="never_written", config={"name": "sales"}))

    writer.update_file_contents()

    models = writer.files_to_write[path]["models"]
    assert [model["name"] for model in models] == ["orders"]


@pytest.mark.parametrize("status", ["Renamed", "Modified", "New", "Deleted"])
def test_every_status_the_map_can_carry_is_handled(status):
    """`update_file_contents` dispatches on status, and an unrecognised one is
    silently skipped. This is the guard on that: core's vocabulary and the
    writer's have to stay the same set."""
    path = _project_file()
    children = _renamed(path, old_name="orders", config={"name": "sales", "sql": "select 1"})
    children["sales"]["status"] = status

    ProjectWriter(children).update_file_contents()  # must not raise
