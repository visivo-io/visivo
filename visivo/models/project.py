from typing import List, Optional, Dict, Any
from visivo.models.alert import Alert
from visivo.models.dag import all_descendants_of_type

from visivo.models.destinations.fields import DestinationField
from visivo.models.include import Include
from visivo.models.inputs.fields import InputField
from visivo.models.inputs.input import Input
from visivo.models.models.model import Model
from visivo.models.models.fields import ModelField
from visivo.models.models.sql_model import SqlModel
from visivo.models.selector import Selector, SelectorType
from visivo.models.sources.fields import SourceField
from visivo.models.metric import Metric
from visivo.models.relation import Relation
from visivo.models.dimension import Dimension

from visivo.models.base.parent_model import ParentModel
from visivo.models.base.base_model import REF_PROPERTY_PATTERN
from visivo.query.patterns import CONTEXT_STRING_REF_PATTERN, get_model_name_from_match
from visivo.models.dashboards.fields import DashboardField
from visivo.models.chart import Chart
from visivo.models.trace import Trace
from visivo.models.insight import Insight
from visivo.models.markdown import Markdown
from visivo.models.table import Table
from visivo.models.defaults import Defaults
from visivo.models.dbt import Dbt
from typing import List
from visivo.models.base.named_model import NamedModel
from visivo.models.base.base_model import BaseModel
from pydantic import ConfigDict, Field, model_validator, PrivateAttr
from visivo.utils import PROJECT_CHILDREN
from click import ClickException
from visivo.version import VISIVO_VERSION


class Project(NamedModel, ParentModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    # Private attributes for schema extraction caching (don't store extractor object to avoid pickle errors)
    _extracted_schemas: Optional[Dict[str, Dict[str, Dict[str, str]]]] = PrivateAttr(default=None)

    defaults: Optional[Defaults] = None
    dbt: Optional[Dbt] = None
    project_file_path: Optional[str] = None
    project_dir: Optional[str] = None
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
    insights: List[Insight] = []
    markdowns: List[Markdown] = Field(
        [],
        description="A list of markdown objects for displaying formatted text in dashboards.",
    )
    tables: List[Table] = []
    charts: List[Chart] = []
    selectors: List[Selector] = []
    inputs: List[InputField] = []
    dashboards: List[DashboardField] = []
    metrics: List[Metric] = Field(
        [], description="A list of global metric objects that can reference multiple models."
    )
    relations: List[Relation] = Field(
        [], description="A list of relation objects defining how models can be joined."
    )
    dimensions: List[Dimension] = Field(
        [], description="A list of project-level dimension objects that can be used across models."
    )

    def child_items(self) -> List:
        project_children = PROJECT_CHILDREN.copy()
        children = []
        for child_type in project_children:
            items = getattr(self, child_type, [])
            children.extend(items)

        # Also add nested metrics and dimensions from SqlModels
        # These are not direct children of the project but need to be in the DAG
        from visivo.models.models.sql_model import SqlModel

        for model in self.models:
            if isinstance(model, SqlModel):
                children.extend(model.metrics)
                children.extend(model.dimensions)

        return children

    def get_all_extracted_schemas(self) -> Optional[Dict[str, Dict[str, Dict[str, str]]]]:
        """Get all extracted schemas.

        Returns:
            Dictionary mapping source names to model names to column schemas.
        """
        return self._extracted_schemas

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
                inline_matches = re.search(CONTEXT_STRING_REF_PATTERN, value)
                if inline_matches and value.strip() == inline_matches.group(0):
                    ref_name = get_model_name_from_match(inline_matches)
                    return json.dumps(
                        {"name": ref_name, "is_inline_defined": False, "original_value": value}
                    )

                # Check for direct ref(Name) pattern
                direct_matches = re.search(REF_PROPERTY_PATTERN, value)
                if direct_matches:
                    ref_name = get_model_name_from_match(direct_matches)
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
    def validate_project(self):
        """
        Run all project validators.

        This method orchestrates all validation logic using the validator classes
        defined in visivo.models.validators. This makes validators easier to find,
        maintain, and test.

        Returns:
            The validated project

        Raises:
            ValueError: If any validation fails
            ClickException: If CLI version validation fails
        """
        from visivo.models.validators import ProjectValidator

        validator = ProjectValidator()
        return validator.validate(self)

    @model_validator(mode="before")
    def set_path_on_named_models(cls, values):
        def set_path_recursively(obj, path=""):
            if isinstance(obj, dict):
                obj["path"] = path
                for key, value in obj.items():
                    if key not in [
                        "props",
                        "defaults",
                        "layout",
                        "columns",
                        "display",
                        "default",
                        "range",
                    ]:
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
