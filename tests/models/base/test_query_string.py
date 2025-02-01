from visivo.models.base.query_string import QueryString


def test_QueryString_get_value():
    query_string = QueryString("?{ value }")
    assert query_string.get_value() == "value"

    query_string = QueryString("?{ value.property }")
    assert query_string.get_value() == "value.property"

    query_string = QueryString("?{ value[0] }")
    assert query_string.get_value() == "value[0]"

    query_string = QueryString("{ value }")
    assert query_string.get_value() == None

    query_string = QueryString('?{ "value" }')
    assert query_string.get_value() == '"value"'
