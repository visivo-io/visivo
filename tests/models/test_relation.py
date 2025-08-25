"""
Tests for the Relation model with new validation rules.
"""

import pytest
from visivo.models.relation import Relation
from pydantic import ValidationError


class TestRelation:
    """Test the Relation model and its validations."""

    def test_valid_relation(self):
        """Test creating a valid relation."""
        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        assert relation.name == "orders_to_users"
        assert relation.join_type == "inner"
        assert relation.is_default == False

        # Check that models are extracted correctly
        models = relation.get_referenced_models()
        assert models == {"orders", "users"}

    def test_relation_without_explicit_models(self):
        """Test that relations work without left_model and right_model."""
        relation = Relation(
            name="product_orders",
            condition="${ref(products).id} = ${ref(order_items).product_id}",
            join_type="left",
        )

        models = relation.get_referenced_models()
        assert models == {"products", "order_items"}

    def test_relation_requires_two_models(self):
        """Test that relation condition must reference at least two models."""
        with pytest.raises(ValidationError) as exc_info:
            Relation(name="invalid", condition="${ref(orders).id} = ${ref(orders).parent_id}")

        error = str(exc_info.value)
        assert "at least two different models" in error

    def test_relation_with_no_models(self):
        """Test that relation fails with no model references."""
        with pytest.raises(ValidationError) as exc_info:
            Relation(name="invalid", condition="1 = 1")

        error = str(exc_info.value)
        assert "at least two different models" in error

    def test_relation_with_one_model(self):
        """Test that relation fails with only one model reference."""
        with pytest.raises(ValidationError) as exc_info:
            Relation(name="invalid", condition="${ref(orders).status} = 'active'")

        error = str(exc_info.value)
        assert "at least two different models" in error

    def test_complex_join_condition(self):
        """Test relation with complex join condition."""
        relation = Relation(
            name="complex_join",
            condition="${ref(orders).user_id} = ${ref(users).id} AND ${ref(orders).status} = ${ref(users).default_status}",
            join_type="inner",
        )

        models = relation.get_referenced_models()
        assert models == {"orders", "users"}

    def test_multiple_field_references_same_models(self):
        """Test that multiple field references from same models work."""
        relation = Relation(
            name="multi_field",
            condition="${ref(table_a).id} = ${ref(table_b).a_id} AND ${ref(table_a).type} = ${ref(table_b).type}",
            join_type="inner",
        )

        models = relation.get_referenced_models()
        assert models == {"table_a", "table_b"}

    def test_is_default_flag(self):
        """Test the is_default flag."""
        relation = Relation(
            name="default_relation",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            is_default=True,
        )

        assert relation.is_default == True

    def test_all_join_types(self):
        """Test all supported join types."""
        for join_type in ["inner", "left", "right", "full"]:
            relation = Relation(
                name=f"{join_type}_join",
                condition="${ref(a).id} = ${ref(b).id}",
                join_type=join_type,
            )
            assert relation.join_type == join_type
