from visivo.templates import queries
from visivo.models.tokenized_trace import TokenizedTrace
from jinja2 import Template
import os


class QueryStringFactory:
    def __init__(self, tokenized_trace: TokenizedTrace):
        self.tokenized_trace = tokenized_trace
        template_path = os.path.join(queries.__path__[0], "default_trace.sql")
        with open(template_path, "r") as f:
            self.template_string = f.read()

    def build(self):
        return Template(self.template_string).render(
            **self.tokenized_trace.model_dump(exclude_none=True)
        )
