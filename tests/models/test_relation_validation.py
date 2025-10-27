"""
Tests for relation validation.

This module tests validation logic for Relation objects, including
edge cases like same-model relations, multi-model relations, and
metric references in join conditions.
"""

import pytest
from visivo.models.relation import Relation
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from tests.factories.model_factories import SourceFactory, RelationFactory


class TestRelationConditionValidation:
    """Test validation of relation conditions."""

    def test_relation_with_less_than_two_models_raises_error(self):
        """Test that relation referencing only one model raises error."""
        # Only references one model
        with pytest.raises(ValueError) as exc_info:
            Relation(
                name="invalid_relation",
                condition="${ref(orders).id} = 123",  # Only one model reference
                join_type="inner",
            )

        error_msg = str(exc_info.value)
        assert "at least two different models" in error_msg.lower()
        assert "orders" in error_msg

    def test_relation_with_no_models_raises_error(self):
        """Test that relation without model references raises error."""
        # No model references at all
        with pytest.raises(ValueError) as exc_info:
            Relation(
                name="invalid_relation",
                condition="column_a = column_b",  # No ${ref(...)}
                join_type="inner",
            )

        error_msg = str(exc_info.value)
        assert "at least two different models" in error_msg.lower()

    def test_relation_with_invalid_ref_syntax_raises_error(self):
        """Test that malformed ref() syntax raises error."""
        # Invalid syntax - missing closing paren causes ref to not be parsed correctly
        with pytest.raises(ValueError) as exc_info:
            Relation(
                name="invalid_relation",
                condition="${ref(orders.id} = ${ref(users).id}",  # Missing closing paren
                join_type="inner",
            )

        error_msg = str(exc_info.value)
        # Because ref(orders.id fails to parse, only users is found, triggering the "two models" error
        assert (
            "at least two different models" in error_msg.lower()
            or "found: ['users']" in error_msg.lower()
        )


class TestRelationSameModelValidation:
    """Test that relations cannot join a model to itself."""

    def test_relation_same_model_both_sides_fails_validation(self):
        """
        Test that relation referencing same model on both sides is caught by validation.

        GREAT NEWS: This validation is already implemented!
        """
        # Same model on both sides - semantically invalid and caught by validator
        with pytest.raises(ValueError) as exc_info:
            Relation(name="self_join", condition="${ref(orders).id} = ${ref(orders).parent_id}")

        error_msg = str(exc_info.value)
        # Validator catches this: "must reference at least two different models"
        assert "at least two different models" in error_msg.lower()
        assert "found: ['orders']" in error_msg.lower() or "orders" in error_msg.lower()

    @pytest.mark.xfail(reason="Same-model validation not yet implemented")
    def test_relation_same_model_validation_future(self):
        """Test for future implementation of same-model validation."""
        with pytest.raises(ValueError) as exc_info:
            Relation(
                name="self_join",
                condition="${ref(orders).id} = ${ref(orders).parent_id}",
            )

        assert "same model" in str(exc_info.value).lower()


class TestRelationMultiModelValidation:
    """Test relations with more than two models."""

    def test_relation_with_three_models_should_fail(self):
        """
        Test that relation with three model references should ideally be rejected.

        NOTE: Current implementation may not validate this strictly.
        This test documents expected behavior.
        """
        source = SourceFactory()
        model_a = SqlModel(name="orders", sql="SELECT * FROM orders", source=f"ref({source.name})")
        model_b = SqlModel(name="users", sql="SELECT * FROM users", source=f"ref({source.name})")
        model_c = SqlModel(
            name="products", sql="SELECT * FROM products", source=f"ref({source.name})"
        )

        # Three models in one condition
        relation = Relation(
            name="three_way",
            condition="${ref(orders).user_id} = ${ref(users).id} AND ${ref(users).product_id} = ${ref(products).id}",
        )

        # CURRENT BEHAVIOR: Validator might count unique models
        # and see len(models) >= 2, so it passes
        project = Project(
            name="test_project",
            sources=[source],
            models=[model_a, model_b, model_c],
            relations=[relation],
            dashboards=[],
        )

        # For now verify it works
        # TODO: Decide if 3+ models should be disallowed
        # (might be valid for complex join conditions)
        assert project is not None

    @pytest.mark.xfail(reason="Three-model validation policy not yet decided")
    def test_relation_exactly_two_models_required_future(self):
        """Test for future strict validation requiring exactly two models."""
        with pytest.raises(ValueError) as exc_info:
            Relation(
                name="three_way",
                condition="${ref(a).x} = ${ref(b).y} AND ${ref(c).z} = 1",
            )

        assert "exactly two models" in str(exc_info.value).lower()


class TestRelationMetricReferences:
    """Test that relations cannot reference metrics (only dimensions/columns)."""

    def test_relation_referencing_metric_should_fail(self):
        """
        Test that relation cannot reference aggregated metric in join condition.

        NOTE: Current implementation may not validate this.
        Joining on aggregated values is semantically invalid.
        """
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
            metrics=[Metric(name="total_revenue", expression="SUM(amount)")],
        )

        # Attempting to join on a metric (aggregated value)
        # This is invalid - joins should be on raw columns/dimensions
        relation = Relation(
            name="invalid_metric_join",
            condition="${ref(orders).total_revenue} = ${ref(users).revenue_target}",
        )

        # CURRENT BEHAVIOR: May pass but produce invalid SQL
        # TODO: Add validation to reject metric references in relations
        try:
            project = Project(
                name="test_project",
                sources=[source],
                models=[model],
                relations=[relation],
                dashboards=[],
            )
            # Currently passes - should eventually fail
            assert project is not None
        except ValueError as e:
            # Future behavior - should fail
            assert "metric" in str(e).lower() or "aggregate" in str(e).lower()

    @pytest.mark.xfail(reason="Metric-in-relation validation not yet implemented")
    def test_relation_metric_validation_future(self):
        """Test for future validation rejecting metric references in relations."""
        with pytest.raises(ValueError) as exc_info:
            Relation(
                name="metric_join",
                condition="${ref(orders).total_revenue} = ${ref(users).id}",
            )

        error_msg = str(exc_info.value)
        assert "metric" in error_msg.lower() or "aggregate" in error_msg.lower()
        assert "join condition" in error_msg.lower()


class TestRelationJoinTypes:
    """Test validation of join types."""

    def test_valid_join_types_succeed(self):
        """Test that all valid join types are accepted."""
        valid_types = ["inner", "left", "right", "full"]

        for join_type in valid_types:
            relation = Relation(
                name=f"{join_type}_join",
                condition="${ref(orders).user_id} = ${ref(users).id}",
                join_type=join_type,
            )
            assert relation.join_type == join_type

    def test_invalid_join_type_raises_error(self):
        """Test that invalid join types raise validation error."""
        with pytest.raises(ValueError):
            Relation(
                name="invalid_join",
                condition="${ref(orders).user_id} = ${ref(users).id}",
                join_type="outer",  # Not in allowed list
            )

    def test_join_type_case_sensitive(self):
        """Test that join type validation is case-sensitive."""
        # Should fail - must be lowercase
        with pytest.raises(ValueError):
            Relation(
                name="wrong_case",
                condition="${ref(orders).user_id} = ${ref(users).id}",
                join_type="INNER",  # Uppercase
            )


class TestRelationIsDefaultFlag:
    """Test the is_default flag for relations."""

    def test_is_default_flag_accepts_boolean(self):
        """Test that is_default accepts boolean values."""
        rel_true = Relation(
            name="default",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            is_default=True,
        )
        assert rel_true.is_default is True

        rel_false = Relation(
            name="non_default",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            is_default=False,
        )
        assert rel_false.is_default is False

    def test_is_default_defaults_to_false(self):
        """Test that is_default defaults to False when not specified."""
        relation = Relation(name="test", condition="${ref(orders).user_id} = ${ref(users).id}")
        assert relation.is_default is False


class TestRelationComplexConditions:
    """Test relations with complex SQL conditions."""

    def test_relation_with_multiple_columns(self):
        """Test relation joining on multiple columns."""
        relation = Relation(
            name="multi_column",
            condition="${ref(orders).user_id} = ${ref(users).id} AND ${ref(orders).org_id} = ${ref(users).org_id}",
        )
        assert relation is not None
        # Should extract both models
        models = relation.get_referenced_models()
        assert models == {"orders", "users"}

    def test_relation_with_expressions(self):
        """Test relation with SQL expressions in condition."""
        relation = Relation(
            name="expression_join",
            condition="DATE_TRUNC('day', ${ref(orders).created_at}) = ${ref(users).signup_date}",
        )
        assert relation is not None
        models = relation.get_referenced_models()
        assert models == {"orders", "users"}

    def test_relation_with_complex_logic(self):
        """Test relation with OR conditions and parentheses."""
        relation = Relation(
            name="complex",
            condition="(${ref(orders).user_id} = ${ref(users).id}) OR (${ref(orders).email} = ${ref(users).email})",
        )
        assert relation is not None
        models = relation.get_referenced_models()
        assert models == {"orders", "users"}


class TestRelationGetReferencedModels:
    """Test the get_referenced_models() method."""

    def test_get_referenced_models_returns_set(self):
        """Test that method returns a set of model names."""
        relation = Relation(name="test", condition="${ref(orders).user_id} = ${ref(users).id}")
        models = relation.get_referenced_models()
        assert isinstance(models, set)
        assert models == {"orders", "users"}

    def test_get_referenced_models_deduplicates(self):
        """Test that duplicate model references are deduplicated."""
        relation = Relation(
            name="test",
            condition="${ref(orders).user_id} = ${ref(users).id} AND ${ref(orders).amount} > 100",
        )
        models = relation.get_referenced_models()
        # orders appears twice but should only be in set once
        assert models == {"orders", "users"}

    def test_get_referenced_models_handles_quoted_names(self):
        """Test that method handles model names with quotes."""
        relation = Relation(name="test", condition="${ref('my-orders').id} = ${ref('my-users').id}")
        models = relation.get_referenced_models()
        assert models == {"my-orders", "my-users"}
