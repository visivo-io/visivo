"""Tests for the Relation model."""

import pytest
from pydantic import ValidationError
from visivo.models.relation import Relation


class TestRelation:
    """Test suite for Relation model."""

    def test_create_basic_relation(self):
        """Test creating a basic relation between two models."""
        relation = Relation(
            name="orders_to_users",
            left_model="orders",
            right_model="users",
            join_type="inner",
            condition="${ref(orders).user_id} = ${ref(users).id}",
        )

        assert relation.name == "orders_to_users"
        assert relation.left_model == "orders"
        assert relation.right_model == "users"
        assert relation.join_type == "inner"
        assert relation.condition == "${ref(orders).user_id} = ${ref(users).id}"
        assert relation.is_default is False  # Default value

    def test_create_relation_with_default_flag(self):
        """Test creating a relation marked as default."""
        relation = Relation(
            name="default_join",
            left_model="accounts",
            right_model="stages",
            condition="${ref(accounts).id} = ${ref(stages).account_id}",
            is_default=True,
        )

        assert relation.is_default is True

    def test_relation_with_different_join_types(self):
        """Test all valid join types."""
        for join_type in ["inner", "left", "right", "full"]:
            relation = Relation(
                name=f"{join_type}_join",
                left_model="a",
                right_model="b",
                join_type=join_type,
                condition="${ref(a).id} = ${ref(b).a_id}",
            )
            assert relation.join_type == join_type

    def test_invalid_join_type(self):
        """Test that invalid join types are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            Relation(
                name="bad_join",
                left_model="a",
                right_model="b",
                join_type="invalid",  # Invalid join type
                condition="${ref(a).id} = ${ref(b).a_id}",
            )

        assert "join_type" in str(exc_info.value).lower()

    def test_relation_with_complex_condition(self):
        """Test relation with complex join condition."""
        relation = Relation(
            name="complex_join",
            left_model="orders",
            right_model="products",
            join_type="left",
            condition="${ref(orders).product_id} = ${ref(products).id} AND ${ref(orders).status} = 'active'",
        )

        assert "AND" in relation.condition
        assert "${ref(orders).status}" in relation.condition

    def test_relation_requires_all_fields(self):
        """Test that required fields are enforced."""
        # Missing condition
        with pytest.raises(ValidationError) as exc_info:
            Relation(name="incomplete", left_model="a", right_model="b")
        assert "condition" in str(exc_info.value)

        # Missing left_model
        with pytest.raises(ValidationError) as exc_info:
            Relation(name="incomplete", right_model="b", condition="test")
        assert "left_model" in str(exc_info.value)

        # Missing right_model
        with pytest.raises(ValidationError) as exc_info:
            Relation(name="incomplete", left_model="a", condition="test")
        assert "right_model" in str(exc_info.value)

    def test_relation_defaults_to_inner_join(self):
        """Test that join_type defaults to 'inner' when not specified."""
        relation = Relation(
            name="default_type",
            left_model="a",
            right_model="b",
            condition="${ref(a).id} = ${ref(b).a_id}",
        )

        assert relation.join_type == "inner"

    def test_relation_forbids_extra_fields(self):
        """Test that extra fields are not allowed."""
        with pytest.raises(ValidationError) as exc_info:
            Relation(
                name="test_relation",
                left_model="a",
                right_model="b",
                condition="test",
                extra_field="not_allowed",
            )

        assert "extra_field" in str(exc_info.value)

    def test_relation_inherits_from_named_model(self):
        """Test that Relation properly inherits from NamedModel."""
        relation = Relation(name="test_relation", left_model="a", right_model="b", condition="test")

        # Should have NamedModel methods
        assert hasattr(relation, "id")
        assert relation.id() == "test_relation"
        assert str(relation) == "test_relation"

    def test_relation_file_path(self):
        """Test that Relation can have file_path from NamedModel."""
        relation = Relation(
            name="test_relation",
            left_model="a",
            right_model="b",
            condition="test",
            file_path="/path/to/config.yml",
        )

        assert relation.file_path == "/path/to/config.yml"

    def test_multiple_relations_between_same_models(self):
        """Test that we can create multiple relations between the same pair of models."""
        relation1 = Relation(
            name="join_by_id",
            left_model="users",
            right_model="accounts",
            condition="${ref(users).account_id} = ${ref(accounts).id}",
            is_default=True,
        )

        relation2 = Relation(
            name="join_by_email",
            left_model="users",
            right_model="accounts",
            condition="${ref(users).email} = ${ref(accounts).owner_email}",
            is_default=False,
        )

        assert relation1.name != relation2.name
        assert relation1.condition != relation2.condition
        assert relation1.is_default is True
        assert relation2.is_default is False
