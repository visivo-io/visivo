import re
from .dialect import Dialect
from enum import Enum


class StatementEnum(Enum):
    aggregate = "aggregate"
    vanilla = "vanilla"
    window = "window"


class StatementClassifier:
    def __init__(self, dialect: Dialect):
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
