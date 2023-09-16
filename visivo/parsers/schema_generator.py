from visivo.models.project import Project
from visivo.models.table import Table
from visivo.models.alert import EmailAlert
from visivo.models.trace import Trace


def generate_schema():
    return Trace.model_json_schema()
