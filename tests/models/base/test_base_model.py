from visivo.models.base.base_model import BaseModel
from visivo.models.base.context_string import ContextString


def test_BaseModel_is_ref():
    assert BaseModel.is_ref("ref(Name)")
    assert BaseModel.is_ref("${ ref(Name) }")
    assert BaseModel.is_ref(ContextString("${ ref(Name) }"))
    assert not BaseModel.is_ref("regular string")
    assert not BaseModel.is_ref({"name": "dict object"})
    assert not BaseModel.is_ref(BaseModel())


class TestDataConfig:
    """What a run actually depends on, as opposed to the whole config.

    Two objects with equal ``data_config`` produce the same artifacts, so an
    edit that leaves it unchanged needs the new config stored and nothing run.
    """

    def _input(self, **overrides):
        from visivo.models.inputs.types.single_select import SingleSelectInput

        fields = {
            "name": "cuisine-select",
            "type": "single-select",
            "label": "Cuisine",
            "options": ["thai", "greek"],
            **overrides,
        }
        return SingleSelectInput(**fields)

    def test_a_relabelled_input_is_the_same_data(self):
        """The reported case: no query reads the label, but renaming it used to
        rebuild the input's options and everything downstream."""
        assert self._input().data_config() == self._input(label="Pick a cuisine").data_config()

    def test_changed_options_are_not(self):
        """Which is the whole point — the guard has to still catch real edits."""
        assert self._input().data_config() != self._input(options=["thai"]).data_config()

    def test_a_description_is_not_data(self):
        """Audited against every job: the only reads of path/file_path are
        failure messages, which name where an error came from and build
        nothing. A description is for people."""
        from visivo.models.base.base_model import ALWAYS_PRESENTATION

        assert ALWAYS_PRESENTATION == frozenset({"path", "file_path", "description"})

    def test_the_authored_file_is_not_data(self):
        """Moving an object between project files changes where it lives, not
        what a job reads."""
        assert (
            self._input(file_path="a.visivo.yml").data_config()
            == self._input(file_path="b.visivo.yml").data_config()
        )

    def test_a_renamed_input_is_different_data(self):
        """The name IS data — artifacts are written under it."""
        assert self._input().data_config() != self._input(name="other").data_config()

    def test_an_unannotated_field_counts_as_data(self):
        """Most data is static — a source's host, a model's sql, a literal
        options list — so the default has to be data. A field nobody
        classified then over-runs rather than skipping a real change."""
        from visivo.models.base.base_model import BaseModel

        assert BaseModel.presentation_fields == frozenset()
        assert BaseModel.data_when_query_valued is False

    def test_nested_models_are_descended_into(self):
        """So each class can answer for its own fields. The display classes
        declare nothing yet, so every field of theirs still counts — what is
        pinned here is that the walk reaches them at all rather than comparing
        the whole subtree by identity."""
        config = self._input(display={"type": "dropdown"}).data_config()

        assert isinstance(config["display"], dict)
        assert "default" in config["display"]

    def test_extra_fields_count_as_data(self):
        """An insight's ``props`` allows extras — ``props.x`` IS the query — so
        a walk that reads only declared fields drops every one of them and no
        insight edit registers as data. The dangerous direction: it skips real
        changes rather than over-running."""
        from tests.factories.model_factories import ProjectFactory

        insight = ProjectFactory().dashboards[0].rows[0].items[0].chart.insights[0]
        before = insight.data_config()
        insight.props.x = "?{updated_field}"

        assert insight.data_config() != before


class TestTheValueRule:
    """For models that are purely presentation, where the answer depends on
    the value rather than the field.

    A plotly ``layout`` declares no fields at all — it is ``extra="allow"`` —
    so there is nothing to list as presentation. Everything in it is styling
    right up until one of the values is a query.
    """

    def _layout(self, title):
        from visivo.models.props.layout import Layout

        return Layout(title={"text": title})

    def _config(self, layout):
        from visivo.models.base.base_model import _data_config

        return _data_config(layout)

    def test_restyling_is_not_data(self):
        assert self._config(self._layout("Revenue")) == self._config(
            self._layout("Revenue by month")
        )

    def test_a_query_valued_field_is(self):
        """The conditional case: same field, different answer by value."""
        assert self._config(self._layout("?{ select max(x) from t }")) != self._config(
            self._layout("Revenue")
        )

    def test_a_ref_counts_too(self):
        assert self._config(self._layout("${ ref(orders) }")) != self._config(
            self._layout("Revenue")
        )

    def test_a_query_nested_deeper_still_counts(self):
        """Styling is arbitrarily nested, so the search has to be as well."""
        from visivo.models.props.layout import Layout

        plain = Layout(xaxis={"title": {"text": "Month"}})
        queried = Layout(xaxis={"title": {"text": "?{ select 1 }"}})

        assert self._config(plain) != self._config(queried)


class TestASourceIsDataAlmostEndToEnd:
    """Everything a source carries reaches the connection the schema job opens,
    so it is the clearest case for the safe default."""

    def _source(self, **overrides):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        fields = {
            "name": "db",
            "type": "postgresql",
            "database": "warehouse",
            "host": "one.example.com",
            **overrides,
        }
        return PostgresqlSource(**fields)

    def test_a_different_host_is_data(self):
        assert self._source().data_config() != self._source(host="two.example.com").data_config()

    def test_a_different_database_is_data(self):
        assert self._source().data_config() != self._source(database="other").data_config()

    def test_the_pool_size_is_not(self):
        """It decides how many connections are held, never what they return."""
        assert self._source().data_config() == self._source(connection_pool_size=9).data_config()
