from visivo.models.base.base_model import generate_ref_field
from visivo.models.models.sql_model import SqlModel

ModelField = SqlModel

ModelRefField = generate_ref_field(SqlModel)
