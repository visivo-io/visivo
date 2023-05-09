import re
from pydantic import root_validator
from .base_model import BaseModel, REF_REGEX
from .test import Test
from .trace_props import TraceProps
from .trace_columns import TraceColumns
from typing import Optional, List
from collections import Counter


class InvalidTestConfiguration(Exception):
    pass


class Trace(BaseModel):
    target_name: Optional[str]
    changed: Optional[bool] = True
    base_sql: str
    cohort_on: Optional[str]
    order_by: Optional[List[str]]
    filters: Optional[List[str]]
    tests: Optional[List[dict]]
    columns: Optional[TraceColumns]
    props: Optional[TraceProps]

    def all_tests(self) -> List[Optional[Test]]:
        tests = []
        type_counter = Counter()
        for test in self.tests:
            if len(test.keys()) > 1:
                # TODO Move this to validation
                raise InvalidTestConfiguration(
                    f"Test in {self.name} has more than one type key"
                )
            type = list(test.keys())[0]
            type_counter.update({type: 1})
            kwargs = test[type]
            name = f"{self.name}-{type}-{type_counter[type]}"
            tests.append(Test(name=name, type=type, kwargs=kwargs))
        return tests

    @root_validator
    def validate_column_refs(cls, values):
        columns, props = (values.get("columns"), values.get("props"))
        if columns is None:
            return values

        columnKeys = list(columns.dict().keys())
        pattern = r"column\((.+)\)"
        for value in props.dict().values():
            match = re.search(pattern, str(value))
            if match:
                value = match.group(1)
                if value not in columnKeys:
                    raise ValueError(
                        f"referenced column name '{value}' is not in columns definition"
                    )

        return values
