from typing import List, Optional
from visivo.models.alert import Alert
from visivo.models.dag import all_descendants_of_type

from visivo.models.destinations.fields import DestinationField
from visivo.models.include import Include
from visivo.models.models.model import Model
from visivo.models.models.fields import ModelField
from visivo.models.models.sql_model import SqlModel
from visivo.models.selector import Selector, SelectorType
from visivo.models.sources.fields import SourceField

from visivo.models.base.parent_model import ParentModel
from visivo.models.base.base_model import REF_REGEX
from visivo.models.base.context_string import INLINE_REF_REGEX
from visivo.models.dashboards.fields import DashboardField
from visivo.models.chart import Chart
from visivo.models.trace import Trace
from visivo.models.table import Table
from visivo.models.defaults import Defaults
from visivo.models.dbt import Dbt
from typing import List
from visivo.models.base.named_model import NamedModel
from visivo.models.base.base_model import BaseModel
from pydantic import ConfigDict, Field, model_validator
from visivo.utils import PROJECT_CHILDREN
from click import ClickException
from visivo.version import VISIVO_VERSION


class Project(NamedModel, ParentModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    defaults: Optional[Defaults] = None
    dbt: Optional[Dbt] = None
    project_file_path: Optional[str] = None
    cli_version: Optional[str] = Field(
        default=VISIVO_VERSION,
        description="The version of the CLI that created the project.",
    )
    includes: List[Include] = []
    destinations: List[DestinationField] = []
    alerts: List[Alert] = []
    sources: List[SourceField] = Field(
        [],
        description="A list of source objects.",
        alias="targets",
    )
    models: List[ModelField] = []
    traces: List[Trace] = []
    tables: List[Table] = []
    charts: List[Chart] = []
    selectors: List[Selector] = []
    dashboards: List[DashboardField] = []

    def child_items(self) -> List:
        project_children = PROJECT_CHILDREN.copy()
        children = []
        for child_type in project_children:
            items = getattr(self, child_type, [])
            children.extend(items)
        return children

    def named_child_nodes(self) -> dict:
        """
        Returns a dictionary of all named child nodes of the project, independent of the
        literal position of the child in the project file. This enables us to find
        all children even if they are nested in a dashboard or chart.
        """
        dag = self.dag()
        named_nodes = {}
        # First pass - collect all nodes and their inline dependencies
        for node in dag.nodes():
            if hasattr(node, "name"):
                if node.name is not None:
                    is_named = True
                else:
                    is_named = False
            else:
                is_named = False
            if is_named and (Project.is_project_child(node) or isinstance(node, Project)):
                fully_referenced_model_dump = Project._fully_referenced_model_dump(node)
                file_path = fully_referenced_model_dump.pop("file_path", self.project_file_path)
                path = fully_referenced_model_dump.pop("path", "Not Found")
                inline_dependent_objects = fully_referenced_model_dump.pop(
                    "inline_dependent_objects", []
                )
                _ = fully_referenced_model_dump.pop("changed", "Not Found")
                direct_children = dag.get_named_children(node.name)
                direct_parents = dag.get_named_parents(node.name)
                contents = {
                    "type": node.__class__.__name__,
                    "type_key": Project.get_key_for_project_child_class(node.__class__.__name__),
                    "config": fully_referenced_model_dump,
                    "file_path": file_path,
                    "new_file_path": file_path,
                    "path": path,
                    "inline_dependent_objects": inline_dependent_objects,
                    "inline_object_parents": [],  # Initialize empty list for parents
                    "is_inline_defined": False,
                    "direct_children": direct_children,
                    "direct_parents": direct_parents,
                }
                named_nodes[node.name] = contents

        # Second pass - build the reverse mapping
        for node_name, node_data in named_nodes.items():
            if node_data["type"] != "Project":
                for dependent_object in node_data["inline_dependent_objects"]:
                    if dependent_object in named_nodes:
                        named_nodes[dependent_object]["inline_object_parents"].append(node_name)
                        named_nodes[dependent_object]["is_inline_defined"] = True
        return named_nodes

    @classmethod
    def _fully_referenced_model_dump(cls, node: ParentModel) -> dict:
        import json
        import re

        def clean_value(value, inline_dependent_objects: list):
            # Case 1: Value is a dictionary
            if isinstance(value, dict):
                # Check if it's a project child and has a non-null 'name'
                if (
                    Project.is_type_project_child(value.get("__type__", "na"))
                    and value.get("name") is not None
                ):
                    inline_defined_named_child = json.dumps(
                        {"name": value["name"], "is_inline_defined": True}
                    )
                    inline_dependent_objects.append(value["name"])
                    return inline_defined_named_child
                # If not replaced, recurse into the dictionary's values
                return {k: clean_value(v, inline_dependent_objects) for k, v in value.items()}
            # Case 2: Value is a list
            elif isinstance(value, list):
                return [clean_value(elem, inline_dependent_objects) for elem in value]
            # Case 3: Value is a primitive (str, int, float, bool, None)
            elif isinstance(value, str):
                # Check for inline references ${ref(Name)}
                inline_matches = re.search(INLINE_REF_REGEX, value)
                if inline_matches and value.strip() == inline_matches.group(0):
                    ref_name = inline_matches.group(1).strip()
                    return json.dumps(
                        {"name": ref_name, "is_inline_defined": False, "original_value": value}
                    )

                # Check for direct ref(Name) pattern
                direct_matches = re.search(REF_REGEX, value)
                if direct_matches:
                    ref_name = direct_matches.group("ref_name").strip()
                    return json.dumps(
                        {"name": ref_name, "is_inline_defined": False, "original_value": value}
                    )
                return value
            else:
                return value

        def remove_type_keys(data):
            if isinstance(data, dict):
                return {k: remove_type_keys(v) for k, v in data.items() if k != "__type__"}
            elif isinstance(data, list):
                return [remove_type_keys(elem) for elem in data]
            else:
                return data

        model_dump_json_string = node.model_dump_json(
            exclude_none=True, context={"include_type": True}
        )
        jsonable_model_dump = json.loads(model_dump_json_string)
        inline_dependent_objects = []
        fully_referenced_project_child_dict = {
            k: clean_value(v, inline_dependent_objects) for k, v in jsonable_model_dump.items()
        }
        fully_referenced_project_child_dict = remove_type_keys(fully_referenced_project_child_dict)
        fully_referenced_project_child_dict["inline_dependent_objects"] = inline_dependent_objects
        return fully_referenced_project_child_dict

    @model_validator(mode="after")
    def validate_cli_version(self):
        if self.cli_version != VISIVO_VERSION:
            raise ClickException(
                f"The project specifies {self.cli_version}, but the current version of visivo installed is {VISIVO_VERSION}. Your project version needs to match your CLI version."
            )
        return self

    @model_validator(mode="after")
    def validate_default_names(self):
        sources, alerts = (self.sources, self.alerts)
        source_names = [source.name for source in sources]
        alert_names = [alert.name for alert in alerts]
        defaults = self.defaults
        if not defaults:
            return self

        if defaults.source_name and defaults.source_name not in source_names:
            raise ValueError(f"default source '{defaults.source_name}' does not exist")

        if defaults.alert_name and defaults.alert_name not in alert_names:
            raise ValueError(f"default alert '{defaults.alert_name}' does not exist")

        return self

    @model_validator(mode="after")
    def validate_models_have_sources(self):
        defaults = self.defaults
        if defaults and defaults.source_name:
            return self

        for model in self.descendants_of_type(Model):
            if isinstance(model, SqlModel) and not model.source:
                raise ValueError(
                    f"'{model.name}' does not specify a source and project does not specify default source"
                )

        return self

    @model_validator(mode="after")
    def validate_dag(self):

        dag = self.dag()
        if not dag.validate_dag():
            raise ValueError("Project contains a circular reference.")

        tables = all_descendants_of_type(type=Table, dag=dag, from_node=self)
        for table in tables:
            selectors = all_descendants_of_type(type=Selector, dag=dag, from_node=table)
            if len(selectors) > 0 and selectors[0].type == SelectorType.multiple:
                raise ValueError(
                    f"Table with name '{table.name}' has a selector with a 'multiple' type.  This is not permitted."
                )

        return self

    @model_validator(mode="after")
    def validate_project_is_sole_root_node(self):
        dag = self.dag()
        roots = dag.get_root_nodes()
        if len(roots) > 1:
            root_list = ", ".join([root.__class__.__name__ for root in roots])
            raise ValueError(
                f"Project must be the sole root node in the DAG. Current root nodes: {root_list}"
            )
        elif len(roots) == 0:
            raise ValueError("No root nodes found in the DAG. Please add a name for your project.")
        elif len(roots) == 1:
            root = roots[0]
            if root.__class__.__name__ != "Project":
                raise ValueError("The sole root node in the DAG must be a Project.")
        return self

    @model_validator(mode="after")
    def validate_names(self):
        Project.traverse_names([], self)
        return self

    @model_validator(mode="before")
    def set_path_on_named_models(cls, values):
        def set_path_recursively(obj, path=""):
            if isinstance(obj, dict):
                obj["path"] = path
                for key, value in obj.items():
                    if key not in ["props", "defaults", "layout", "columns"]:
                        new_path = f"{path}.{key}" if path else key
                        set_path_recursively(value, new_path)
            elif isinstance(obj, list):
                for index, item in enumerate(obj):
                    new_path = f"{path}[{index}]"
                    set_path_recursively(item, new_path)

        set_path_recursively(values, "project")
        return values

    @classmethod
    def get_child_objects(cls) -> dict:
        """
        Returns a dictionary mapping each project child type to its field object.
        This is used to identify which objects in the project hierarchy are direct children of the project.
        """
        child_objects = {}
        for field_name in PROJECT_CHILDREN:
            field = cls.model_fields[field_name]
            child_objects[field_name] = field
        return child_objects

    @classmethod
    def is_type_project_child(cls, object_type: str) -> bool:
        """
        Accepts a string and returns True if it is a child of the project.
        """
        from re import search

        project_child_objects = cls.get_child_objects()

        search_str = rf"[\s\[]{object_type}[,\]]"
        is_match = search(search_str, str(project_child_objects)) is not None

        return is_match

    @classmethod
    def is_project_child(cls, obj) -> list:
        """
        Accepts an object and returns True if it is a child of the project.
        """
        from re import search

        project_child_objects = cls.get_child_objects()
        if isinstance(obj, BaseModel):
            obj_name = obj.__class__.__name__
            search_str = rf"[\s\[]{obj_name}[,\]]"
            is_match = search(search_str, str(project_child_objects)) is not None
            return is_match
        return False

    @classmethod
    def get_key_for_project_child_class(cls, project_child_class: str) -> str:
        """
        Accepts an object and returns True if it is a child of the project.
        """
        from re import search

        project_child_objects = cls.get_child_objects()
        for key, value in project_child_objects.items():
            search_str = rf"[\s\[]{project_child_class}[,\]]"
            is_match = search(search_str, str(value)) is not None
            if is_match:
                return key
        if project_child_class == "Project":
            return "na"
        raise ValueError(f"Project child class '{project_child_class}' not found in project")

    @classmethod
    def traverse_names(cls, names, object):
        if isinstance(object, ParentModel):
            for child_item in object.child_items():
                if isinstance(child_item, BaseModel) and hasattr(child_item, "name"):
                    name = NamedModel.get_name(obj=child_item)
                    if name in names:
                        raise ValueError(
                            f"{child_item.__class__.__name__} name '{name}' is not unique in the project"
                        )
                    if name:
                        names.append(name)
                Project.traverse_names(names, child_item)
