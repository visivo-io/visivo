"""Tests for relation references validator."""

import pytest
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.relation import Relation
from tests.factories.model_factories import SourceFactory


class TestRelationReferencesValidator:
    """Tests for relation reference validation."""

    def test_valid_relation_referencing_models(self):
        """Test that a relation can reference models."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source.name})",
        )

        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="inner",
        )

        # Should not raise
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model],
            relations=[relation],
            dashboards=[],
        )
        assert project is not None

    def test_relation_with_multiple_models(self):
        """Test that a relation can reference multiple models."""
        source = SourceFactory()
        orders_model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source=f"ref({source.name})",
        )
        users_model = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source=f"ref({source.name})",
        )
        products_model = SqlModel(
            name="products",
            sql="SELECT * FROM products",
            source=f"ref({source.name})",
        )

        relation = Relation(
            name="complex_join",
            condition="${ref(orders).user_id} = ${ref(users).id} AND ${ref(orders).product_id} = ${ref(products).id}",
            join_type="inner",
        )

        # Should not raise - relations can reference multiple models
        project = Project(
            name="test_project",
            sources=[source],
            models=[orders_model, users_model, products_model],
            relations=[relation],
            dashboards=[],
        )
        assert project is not None
