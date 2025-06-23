import re
from typing import List
from abc import ABC, abstractmethod
from visivo.models.base.base_model import BaseModel
from visivo.models.base.named_model import NamedModel
from visivo.models.base.project_dag import ProjectDag
from pydantic_core import PydanticCustomError
from pydantic import model_serializer
from visivo.models.dag import (
    all_descendants,
    all_descendants_of_type,
    all_descendants_with_name,
    all_descendants_with_path_match,
    all_nodes_including_named_node_in_graph,
    create_dag_dict,
)
from visivo.models.sources.source import DefaultSource


class ParentModel(ABC):
    @model_serializer(mode="wrap")
    def wrap_serializer(self, serializer, info):
        # Get the default serialized output
        serialized = serializer(self)
        # Check the context to decide whether to include the class type
        if info.context and info.context.get("include_type", False):
            serialized["__type__"] = self.__class__.__name__
        return serialized

    @abstractmethod
    def child_items(self):
        return []

    def dag(self, node_permit_list=None) -> ProjectDag:
        dag = ProjectDag()
        dag.add_node(self)
        self.__build_dag(
            items=self.child_items(),
            parent_item=self,
            dag=dag,
            node_permit_list=node_permit_list,
            root=self,
        )
        self.__dereference_items(
            items=self.child_items(),
            parent_item=self,
            dag=dag,
            node_permit_list=node_permit_list,
            root=self,
        )
        return dag

    def __build_dag(self, items: List, parent_item, dag, node_permit_list, root):
        for item in items:
            if node_permit_list is None or item in node_permit_list:
                dag_item = item
                if (
                    item is None
                    or BaseModel.is_ref(item)
                    or item.__class__.__name__ == "ContextString"
                ):
                    continue
                elif isinstance(item, DefaultSource):
                    name = root.defaults.source_name
                    dag_item = self.__get_dereferenced_item_by_name(
                        name=name,
                        dag=dag,
                        root=root,
                        item=item,
                        parent_item=parent_item,
                    )
                if item.__class__.__name__ == "Test":
                    dag.add_edge(root, dag_item)
                else:
                    dag.add_edge(parent_item, dag_item)
                if isinstance(dag_item, ParentModel):
                    self.__build_dag(
                        items=dag_item.child_items(),
                        parent_item=dag_item,
                        dag=dag,
                        node_permit_list=node_permit_list,
                        root=root,
                    )

    def __dereference_items(self, items: List, parent_item, dag, node_permit_list, root):
        for item in items:
            if node_permit_list is None or item in node_permit_list:
                if item.__class__.__name__ == "ContextString":
                    dereferenced_item = self.__get_dereferenced_item_by_context_string(
                        context_string=item,
                        dag=dag,
                        root=root,
                        parent_item=parent_item,
                    )
                    dag.add_edge(parent_item, dereferenced_item)
                elif BaseModel.is_ref(item):
                    name = NamedModel.get_name(obj=item)
                    dereferenced_item = self.__get_dereferenced_item_by_name(
                        name=name,
                        dag=dag,
                        root=root,
                        item=item,
                        parent_item=parent_item,
                    )
                    dag.add_edge(parent_item, dereferenced_item)
                if isinstance(item, ParentModel):
                    self.__dereference_items(
                        items=item.child_items(),
                        parent_item=item,
                        dag=dag,
                        node_permit_list=node_permit_list,
                        root=root,
                    )

    def descendants(self):
        return all_descendants(dag=self.dag(), from_node=self)

    def descendants_of_type(self, type, dag=None):
        if not dag:
            dag = self.dag()
        return all_descendants_of_type(type=type, dag=dag, from_node=self)

    def nodes_including_named_node_in_graph(self, name):
        return all_nodes_including_named_node_in_graph(name=name, dag=self.dag())

    @staticmethod
    def filtered(pattern, objects) -> List:
        def name_match(obj):
            return re.search(pattern, obj.name)

        return list(filter(name_match, objects))

    def dag_dict(self):
        return create_dag_dict(self.dag())

    def __get_dereferenced_item_by_name(self, name, dag, root, item, parent_item):
        dereferenced_items = all_descendants_with_name(name=name, dag=dag, from_node=root)
        if len(dereferenced_items) == 1:
            return dereferenced_items[0]
        elif len(dereferenced_items) > 1:
            file_paths = set(
                path
                for path in map(lambda ref: ref.file_path, dereferenced_items)
                if path is not None
            )
            raise PydanticCustomError(
                "ambiguous_reference",
                f'The reference "{item}" on item "{parent_item.id()}" points to multiple objects. Check for the duplicated name "{name}" in the following files: {" and ".join(file_paths)}.',
                parent_item.model_dump(),
            )
        else:
            raise PydanticCustomError(
                "bad_reference",
                f'The reference "{item}" on item "{parent_item.id()}" does not point to an object.',
                parent_item.model_dump(),
            )

    def __get_dereferenced_item_by_context_string(self, context_string, dag, root, parent_item):
        if context_string.get_reference():
            return self.__get_dereferenced_item_by_name(
                item=context_string,
                name=context_string.get_reference(),
                dag=dag,
                root=root,
                parent_item=parent_item,
            )
        elif context_string.get_path():
            path = context_string.get_path()
            dereferenced_items = all_descendants_with_path_match(path=path, dag=dag, from_node=root)
            dereferenced_items.sort(key=lambda x: len(x.path), reverse=True)

            if len(dereferenced_items) > 0:
                return dereferenced_items[0]
            else:
                raise PydanticCustomError(
                    "bad_reference",
                    f'The reference "{path}" on item "{parent_item.id()}" does not point to an object.',
                    parent_item.model_dump(),
                )
