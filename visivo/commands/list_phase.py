from pydantic import BaseModel
from visivo.models.sources.source import Source
from visivo.models.models.model import Model
from visivo.models.trace import Trace


def list_phase(project, object_type):
    objects = []

    def collect_objects(item, target_type):
        collected = []
        if isinstance(item, list):
            for sub_item in item:
                collected.extend(collect_objects(sub_item, target_type))
        elif isinstance(item, BaseModel):
            for f in item.model_fields_set:
                collected.extend(collect_objects(getattr(item, f), target_type))
            if "name" in item.model_fields_set:
                name = getattr(item, "name")
                if isinstance(item, Source) and target_type == "sources":
                    collected.append(name)
                elif isinstance(item, Model) and target_type == "models":
                    collected.append(name)
                elif isinstance(item, Trace) and target_type == "traces":
                    collected.append(name)

        return collected

    objects = collect_objects(project, object_type)
    objects = list(map(lambda x: f" - {x}", objects))

    # Print each object's name on a new line
    print(f"{object_type}:\n" + "\n".join(objects))
