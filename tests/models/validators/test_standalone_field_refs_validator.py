import pytest
from pydantic import ValidationError

from tests.factories.model_factories import (
    DimensionFactory,
    MetricFactory,
    ProjectFactory,
    SqlModelFactory,
)
from visivo.models.validators import standalone_field_ref_error


class TestStandaloneFieldRefRule:
    """A metric/dimension must reach a source through a model. The two forms do
    it differently — nesting, or a ref — and only one of them can be satisfied
    by a scaffolded default."""

    def test_a_project_level_field_with_no_ref_is_rejected(self):
        error = standalone_field_ref_error("count(*)", "metric", "new_metric")
        assert error is not None
        # The message has to say what to do, not just what is wrong.
        assert "must reference at least one model" in error
        assert "${ref(model_name).column}" in error

    @pytest.mark.parametrize(
        "expression",
        [
            "sum(${ref(orders).amount})",
            "${ref(orders).region}",
            "${ref(other_metric)}",
            "sum(${ref(orders).amount}) / count(${ref(orders).id})",
        ],
    )
    def test_a_ref_anywhere_in_the_expression_satisfies_it(self, expression):
        assert standalone_field_ref_error(expression, "metric", "m") is None

    def test_an_empty_expression_is_rejected(self):
        assert standalone_field_ref_error("", "dimension", "d") is not None
        assert standalone_field_ref_error(None, "dimension", "d") is not None


class TestValidatorOnTheProject:
    def _project(self, **kwargs):
        return ProjectFactory(
            models=[SqlModelFactory(name="orders")],
            insights=[],
            charts=[],
            dashboards=[],
            **kwargs,
        )

    def test_a_project_level_metric_with_no_ref_fails_the_project(self):
        with pytest.raises(ValidationError) as excinfo:
            self._project(metrics=[MetricFactory(name="new_metric", expression="count(*)")])
        assert "must reference at least one model" in str(excinfo.value)

    def test_a_project_level_dimension_with_no_ref_fails_the_project(self):
        with pytest.raises(ValidationError) as excinfo:
            self._project(dimensions=[DimensionFactory(name="new_dimension", expression="1")])
        assert "must reference at least one model" in str(excinfo.value)

    def test_a_project_level_field_with_a_ref_passes(self):
        project = self._project(
            metrics=[MetricFactory(name="ok", expression="sum(${ref(orders).amount})")]
        )
        assert [m.name for m in project.metrics] == ["ok"]

    def test_a_NESTED_field_with_no_ref_is_untouched(self):
        """The rule must not fire on nested fields — nesting is what ties them
        to a source, and a nested expression may not contain a ref at all."""
        project = ProjectFactory(
            models=[
                SqlModelFactory(
                    name="orders",
                    metrics=[MetricFactory(name="nested_metric", expression="count(*)")],
                    dimensions=[DimensionFactory(name="nested_dim", expression="1")],
                )
            ],
            insights=[],
            charts=[],
            dashboards=[],
        )
        (model,) = project.models
        assert [m.name for m in model.metrics] == ["nested_metric"]
        assert [d.name for d in model.dimensions] == ["nested_dim"]

    def test_it_reports_before_the_vaguer_single_source_error(self):
        """`SingleSourceValidator` said 'does not tie back to any source' — a
        late, global message for a local mistake. This runs first."""
        with pytest.raises(ValidationError) as excinfo:
            self._project(metrics=[MetricFactory(name="new_metric", expression="count(*)")])
        message = str(excinfo.value)
        assert "must reference at least one model" in message
        assert "does not tie back to any source" not in message
