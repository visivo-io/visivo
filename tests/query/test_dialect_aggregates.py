"""Test that DuckDB dialect recognizes all statistical aggregate functions."""

import pytest
from visivo.query.statement_classifier import StatementClassifier, StatementEnum


class TestDuckDBStatisticalAggregates:
    """Test DuckDB statistical aggregate function recognition."""

    def test_duckdb_stddev_pop_recognized(self):
        """Test that STDDEV_POP is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        # Test various forms of STDDEV_POP
        assert classifier.classify("STDDEV_POP(y)") == StatementEnum.aggregate
        assert classifier.classify("stddev_pop(y)") == StatementEnum.aggregate
        assert classifier.classify("STDDEV_POP(column_name)") == StatementEnum.aggregate

    def test_duckdb_var_pop_recognized(self):
        """Test that VAR_POP is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        # Test various forms of VAR_POP
        assert classifier.classify("VAR_POP(y)") == StatementEnum.aggregate
        assert classifier.classify("var_pop(y)") == StatementEnum.aggregate
        assert classifier.classify("VAR_POP(column_name)") == StatementEnum.aggregate

    def test_duckdb_stddev_samp_recognized(self):
        """Test that STDDEV_SAMP is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("STDDEV_SAMP(y)") == StatementEnum.aggregate
        assert classifier.classify("stddev_samp(y)") == StatementEnum.aggregate

    def test_duckdb_var_samp_recognized(self):
        """Test that VAR_SAMP is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("VAR_SAMP(y)") == StatementEnum.aggregate
        assert classifier.classify("var_samp(y)") == StatementEnum.aggregate

    def test_duckdb_variance_recognized(self):
        """Test that VARIANCE is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("VARIANCE(y)") == StatementEnum.aggregate
        assert classifier.classify("variance(y)") == StatementEnum.aggregate

    def test_duckdb_median_recognized(self):
        """Test that MEDIAN is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("MEDIAN(y)") == StatementEnum.aggregate
        assert classifier.classify("median(y)") == StatementEnum.aggregate

    def test_duckdb_mode_recognized(self):
        """Test that MODE is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("MODE(y)") == StatementEnum.aggregate
        assert classifier.classify("mode(y)") == StatementEnum.aggregate

    def test_duckdb_corr_recognized(self):
        """Test that CORR is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("CORR(x, y)") == StatementEnum.aggregate
        assert classifier.classify("corr(x, y)") == StatementEnum.aggregate

    def test_duckdb_covar_pop_recognized(self):
        """Test that COVAR_POP is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("COVAR_POP(x, y)") == StatementEnum.aggregate
        assert classifier.classify("covar_pop(x, y)") == StatementEnum.aggregate

    def test_duckdb_covar_samp_recognized(self):
        """Test that COVAR_SAMP is recognized as an aggregate for DuckDB."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("COVAR_SAMP(x, y)") == StatementEnum.aggregate
        assert classifier.classify("covar_samp(x, y)") == StatementEnum.aggregate

    def test_wrapped_aggregate_in_function(self):
        """Test that wrapped aggregates are still recognized."""
        classifier = StatementClassifier(source_type="duckdb")

        # Test ROUND wrapped around aggregate
        assert classifier.classify("ROUND(STDDEV_POP(y), 2)") == StatementEnum.aggregate
        assert classifier.classify("ROUND(VAR_POP(y), 2)") == StatementEnum.aggregate

    def test_non_aggregate_classified_as_vanilla(self):
        """Test that non-aggregates are classified as vanilla."""
        classifier = StatementClassifier(source_type="duckdb")

        assert classifier.classify("column_name") == StatementEnum.vanilla
        assert classifier.classify("x + y") == StatementEnum.vanilla
        assert classifier.classify("ROUND(column_name, 2)") == StatementEnum.vanilla
