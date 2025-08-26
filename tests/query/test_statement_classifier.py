from visivo.query.statement_classifier import StatementClassifier, StatementEnum


def test_statement_classifier():
    statement_classifier = StatementClassifier(source_type="postgresql")

    # Correct SQL with PARTITION spelled correctly
    statement = "SUM(column_a) OVER(PARTITION BY column_b)"
    assert statement_classifier.classify(statement) == StatementEnum.window

    # Test incomplete window function (missing closing paren) - should raise error
    statement = "SUM(column_a) OVER(PARTITION BY column_b"
    try:
        statement_classifier.classify(statement)
        assert False, "Should have raised ValueError for invalid SQL"
    except ValueError as e:
        assert "Unable to parse SQL statement" in str(e)

    statement = "count( column_a )"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate

    statement = "column_a + 1"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

    # SQLGlot will transpile group_concat to string_agg for PostgreSQL
    statement = "group_concat(column_a + 1)"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate

    statement = "top_countries"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla


def test_statement_classifier_snowflake():
    statement_classifier = StatementClassifier(source_type="snowflake")

    # Correct SQL with PARTITION spelled correctly
    statement = "SUM(column_a) OVER(PARTITION BY column_b)"
    assert statement_classifier.classify(statement) == StatementEnum.window

    # Test incomplete window function (missing closing paren) - should raise error
    statement = "SUM(column_a) OVER(PARTITION BY column_b"
    try:
        statement_classifier.classify(statement)
        assert False, "Should have raised ValueError for invalid SQL"
    except ValueError as e:
        assert "Unable to parse SQL statement" in str(e)

    statement = "count( column_a )"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate

    statement = "top_countries"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

    statement = "column_a + 1"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

    # SQLGlot will transpile group_concat to listagg for Snowflake
    statement = "group_concat(column_a + 1)"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate
