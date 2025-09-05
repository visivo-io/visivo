from enum import Enum
from visivo.query.sqlglot_utils import classify_statement, get_sqlglot_dialect


class StatementEnum(Enum):
    aggregate = "aggregate"
    vanilla = "vanilla"
    window = "window"


class StatementClassifier:
    def __init__(self, source_type: str = None):
        """Initialize with source type instead of Dialect object."""
        self.source_type = source_type
        self.dialect = get_sqlglot_dialect(source_type) if source_type else None

    def classify(self, statement: str) -> StatementEnum:
        """Classify a SQL statement using SQLGlot AST analysis."""
        classification = classify_statement(statement, self.dialect)
        return StatementEnum(classification)
