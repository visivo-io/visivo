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

    def test_an_unannotated_model_keeps_every_field(self):
        """Empty by default, so a field nobody classified counts as data and
        over-runs rather than skipping a real change."""
        from visivo.models.base.base_model import BaseModel

        assert BaseModel.presentation_fields == frozenset()

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
