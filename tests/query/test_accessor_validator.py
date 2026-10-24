import pytest

from visivo.query.accessor_validator import (
    AccessorValidationError,
    get_accessor_sample_value,
    validate_all_input_accessors,
    validate_input_accessor,
)


class TestValidateInputAccessor:
    def test_an_unknown_accessor_lists_the_valid_ones(self):
        with pytest.raises(AccessorValidationError, match="unknown accessor '.size'") as raised:
            validate_input_accessor("regions", "size", "multi-select")

        assert "values" in str(raised.value)

    def test_a_range_accessor_on_a_single_select_is_refused(self):
        with pytest.raises(AccessorValidationError, match="only valid for multi-select"):
            validate_input_accessor("month", "min", "single-select")

    def test_value_on_a_multi_select_suggests_values(self):
        with pytest.raises(AccessorValidationError, match="Did you mean .values"):
            validate_input_accessor("regions", "value", "multi-select")

    def test_matching_accessors_pass(self):
        validate_input_accessor("month", "value", "single-select")
        validate_input_accessor("regions", "values", "multi-select")


class TestValidateAllInputAccessors:
    def test_returns_each_validated_reference(self):
        query = "x IN (${ref(regions).values}) AND m = ${ref(month).value}"

        validated = validate_all_input_accessors(
            query, {"regions": "multi-select", "month": "single-select"}
        )

        assert validated == [("regions", "values"), ("month", "value")]

    def test_an_undefined_input_is_refused(self):
        with pytest.raises(ValueError, match="input 'regions' is defined"):
            validate_all_input_accessors("x IN (${ref(regions).values})", {})

    def test_a_wrong_accessor_is_refused(self):
        with pytest.raises(AccessorValidationError):
            validate_all_input_accessors("m = ${ref(month).values}", {"month": "single-select"})


class TestSampleValueFallbacks:
    def test_a_scalar_accessor_without_options_samples_zero(self):
        assert get_accessor_sample_value("min", []) == "0"

    def test_an_unknown_accessor_samples_the_first_option(self):
        assert get_accessor_sample_value("size", ["North", "South"]) == "North"
