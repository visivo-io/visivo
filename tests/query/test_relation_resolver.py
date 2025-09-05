"""
Test the RelationResolver class.
"""

import pytest
from visivo.query.relation_resolver import RelationResolver


class TestRelationResolver:
    """Test cases for RelationResolver."""
    
    def test_resolve_simple_condition(self):
        """Test resolving a simple join condition."""
        resolver = RelationResolver()
        
        condition = "${ref(orders).user_id} = ${ref(users).id}"
        resolved = resolver.resolve_condition(condition)
        
        assert resolved == "orders_cte.user_id = users_cte.id"
        assert "${" not in resolved
        assert "ref(" not in resolved
    
    def test_resolve_quoted_model_names(self):
        """Test resolving conditions with quoted model names."""
        resolver = RelationResolver()
        
        condition = "${ref('orders').user_id} = ${ref('users').id}"
        resolved = resolver.resolve_condition(condition)
        
        assert resolved == "orders_cte.user_id = users_cte.id"
    
    def test_resolve_with_model_alias_map(self):
        """Test resolving with a custom model alias map."""
        alias_map = {
            "orders": "orders_sanitized",
            "users": "users_sanitized"
        }
        resolver = RelationResolver(alias_map)
        
        condition = "${ref(orders).user_id} = ${ref(users).id}"
        resolved = resolver.resolve_condition(condition)
        
        assert resolved == "orders_sanitized_cte.user_id = users_sanitized_cte.id"
    
    def test_resolve_complex_condition(self):
        """Test resolving more complex conditions."""
        resolver = RelationResolver()
        
        condition = "${ref(orders).user_id} = ${ref(users).id} AND ${ref(orders).status} = 'active'"
        resolved = resolver.resolve_condition(condition)
        
        assert resolved == "orders_cte.user_id = users_cte.id AND orders_cte.status = 'active'"
    
    def test_resolve_with_special_characters_in_model_names(self):
        """Test resolving conditions with special characters in model names."""
        alias_map = {
            "my-model.v2": "mymodelv2_sanitized",
            "sales (2024)": "sales2024_sanitized"
        }
        resolver = RelationResolver(alias_map)
        
        condition = "${ref('my-model.v2').id} = ${ref('sales (2024)').model_id}"
        resolved = resolver.resolve_condition(condition)
        
        assert resolved == "mymodelv2_sanitized_cte.id = sales2024_sanitized_cte.model_id"
    
    def test_extract_referenced_models(self):
        """Test extracting model names from a condition."""
        resolver = RelationResolver()
        
        condition = "${ref(orders).user_id} = ${ref(users).id}"
        models = resolver.extract_referenced_models(condition)
        
        assert models == {"orders", "users"}
    
    def test_extract_referenced_models_quoted(self):
        """Test extracting model names with quotes."""
        resolver = RelationResolver()
        
        condition = "${ref('orders').user_id} = ${ref('users').id}"
        models = resolver.extract_referenced_models(condition)
        
        assert models == {"orders", "users"}
    
    def test_validate_valid_condition(self):
        """Test validation of a valid condition."""
        resolver = RelationResolver()
        
        condition = "${ref(orders).user_id} = ${ref(users).id}"
        assert resolver.validate_condition(condition) is True
    
    def test_validate_invalid_condition_missing_ref(self):
        """Test validation of condition with invalid context string."""
        resolver = RelationResolver()
        
        condition = "${orders.user_id} = ${users.id}"  # Missing ref()
        assert resolver.validate_condition(condition) is False
    
    def test_validate_invalid_condition_single_model(self):
        """Test validation of condition with only one model."""
        resolver = RelationResolver()
        
        condition = "${ref(orders).user_id} = 123"
        assert resolver.validate_condition(condition) is False
    
    def test_resolve_custom_suffix(self):
        """Test resolving with a custom suffix."""
        resolver = RelationResolver()
        
        condition = "${ref(orders).user_id} = ${ref(users).id}"
        resolved = resolver.resolve_condition(condition, suffix="_table")
        
        assert resolved == "orders_table.user_id = users_table.id"
    
    def test_resolve_preserves_whitespace(self):
        """Test that resolution preserves whitespace in the condition."""
        resolver = RelationResolver()
        
        condition = "   ${ref(orders).user_id}   =   ${ref(users).id}   "
        resolved = resolver.resolve_condition(condition)
        
        assert resolved == "   orders_cte.user_id   =   users_cte.id   "