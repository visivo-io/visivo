from ..templates.queries import tests
from ..query.query_string_factory import QueryStringFactory
from ..models.test import Test
from jinja2 import Template
import os


class TestQueryStringFactory:
    def __init__(self, test: Test, query_string_factory: QueryStringFactory):
        self.test_type = test.type
        self.test_parameters = test.kwargs
        template_path = os.path.join(tests.__path__[0], f"{self.test_type}.sql")
        self.trace_sql = query_string_factory.build()
        with open(template_path, "r") as f:
            self.template_string = f.read()

    def build(self) -> str:
        return Template(self.template_string).render(
            trace_sql=self.trace_sql, **self.test_parameters
        )

    __test__ = False
