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
        agg_pattern = "|".join(self.dialect.aggregates)
        has_aggregates = bool(re.search(agg_pattern, statement, re.IGNORECASE))
        window_pattern = "over\s*\(.*\)"
        has_windows = bool(re.search(window_pattern, statement, re.IGNORECASE))
        if has_windows:
            type = StatementEnum.window
        elif has_aggregates:
            type = StatementEnum.aggregate
        else:
            type = StatementEnum.vanilla

        return type
