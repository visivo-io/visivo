from visivo.query.statement_classifier import StatementClassifier, StatementEnum
from visivo.query.dialect import Dialect


def test_statement_classifier():
    dialect = Dialect(type="postgresql")
    statement_classifier = StatementClassifier(dialect=dialect)

    statement = "SUM(column_a) OVER(PARTIITON BY column_b)"
    assert statement_classifier.classify(statement) == StatementEnum.window

    statement = "SUM(column_a) OVER(PARTIITON BY column_b"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate

    statement = "count( column_a )"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate

    statement = "column_a + 1"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

    # non-postgres aggregate functions should evaluate to vanilla
    statement = "group_concat(column_a + 1)"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

    statement = "top_countries"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

def test_statement_classifier_snowflake():
    dialect = Dialect(type="snowflake")
    statement_classifier = StatementClassifier(dialect=dialect)

    statement = "SUM(column_a) OVER(PARTIITON BY column_b)"
    assert statement_classifier.classify(statement) == StatementEnum.window

    statement = "SUM(column_a) OVER(PARTIITON BY column_b"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate

    statement = "count( column_a )"
    assert statement_classifier.classify(statement) == StatementEnum.aggregate

    statement = "top_countries"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

    statement = "column_a + 1"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla

    # non-postgres aggregate functions should evaluate to vanilla
    statement = "group_concat(column_a + 1)"
    assert statement_classifier.classify(statement) == StatementEnum.vanilla
