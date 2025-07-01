import re
import warnings
from visivo.query.dialect import Dialect
from enum import Enum


class StatementEnum(Enum):
    aggregate = "aggregate"
    vanilla = "vanilla"
    window = "window"


class StatementClassifier:
    """
    DEPRECATED: This class is deprecated in favor of SQLGlot-based parsing.
    Use visivo.query.sql_validator.classify_expression instead.
    """
    def __init__(self, dialect: Dialect):
        warnings.warn(
            "StatementClassifier is deprecated. Use classify_expression from "
            "visivo.query.sql_validator instead.",
            DeprecationWarning,
            stacklevel=2
        )
        self.dialect = dialect

    def classify(self, statement):
        has_aggregates = bool(
            re.search(self.dialect.aggregates_regex_pattern, statement, re.IGNORECASE)
        )
        window_pattern = r"over\s*\(.*\)"
        has_windows = bool(re.search(window_pattern, statement, re.IGNORECASE))
        if has_windows:
            type = StatementEnum.window
        elif has_aggregates:
            type = StatementEnum.aggregate
        else:
            type = StatementEnum.vanilla

        return type
