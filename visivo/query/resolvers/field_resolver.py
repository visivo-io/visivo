from visivo.models.base.project_dag import ProjectDag
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.query.patterns import CONTEXT_STRING_REF_PATTERN, get_model_name_from_match


class FieldResolver:
    """
    Recursively resolves 
      1. Implicit dimensions. These are the default when there's no metric/dimension found at the path. They will fail on runtime if expressed incorrectly 
         ie. ${ref(model-name)."column on model"} --> "hash(model-name)"."column on model"
      2. Global metrics & dimensions based on their expressions 
         ie. ${ref(...)} --> "sql string contained in the expression on the object" 
      3. Model scoped metric & or dimension references 
         ie. ${ref(model)."metric or dimension in dag"} --> "expression of metric or dimension"

    Need to ensure that we're expressing column and table names fully referenced. 
    """
    def __init__(self, dag: ProjectDag):
        self.dag = dag

    def resolve(self, unresolved_expression): 
        """
        Recurse through the three cases by leveraging the dag when a regex match connects to a metric or dimension. 
        """
        return "pass" 
    