from pydantic import BaseModel
from copy import deepcopy

KEYWORDS = {
    "aggregates": {
        "all": {"sum", "max", "min", "avg", "count"},
        "sqlite": {
            "total",
            "group_concat",
        },
        "postgresql": {
            "array_agg",
            "bit_and",
            "bit_or",
            "bool_and",
            "bool_or",
            "every",
            "json_agg",
            "jsonb_agg",
            "json_object_agg",
            "jsonb_object_agg",
            "string_agg",
            "xmlagg",
        },
        "snowflake": {
            "any_value",
            "stddev",
            "corr",
            "count_if",
            "covar_pop",
            "covar_samp",
            "listagg",
            "median",
            "mode",
            "stddev",
            "stddev_pop",
            "stddev_samp",
            "var_pop",
            "var_samp",
            "variance_pop",
            "variance",
            "variance_samp",
        },
        "mysql": {
            "bit_and",
            "bit_or",
            "bit_xor",
            "group_concat",
            "json_arrayagg",
            "json_objectagg",
            "std",
            "stddev",
            "stddev_pop",
            "stddev_samp",
            "var_pop",
            "var_samp",
            "variance",
        },
        "bigquery": {
            "any_value",
            "approx_count_distinct",
            "approx_quantiles",
            "approx_top_count",
            "approx_top_sum",
            "array_agg",
            "array_concat_agg",
            "bit_and",
            "bit_or",
            "bit_xor",
            "corr",
            "countif",
            "covar_pop",
            "covar_samp",
            "grouping",
            "logical_and",
            "logical_or",
            "max_by",
            "min_by",
            "st_centroid_agg",
            "st_extent",
            "st_union_agg",
            "stddev",
            "stddev_pop",
            "stddev_samp",
            "string_agg",
            "var_pop",
            "var_samp",
            "variance",
        },
        "duckdb": {
            "any_value",
            "arbitrary",
            "arg_max",
            "arg_max_null",
            "arg_min",
            "arg_min_null",
            "array_agg",
            "avg",
            "bit_and",
            "bit_or",
            "bit_xor",
            "bitstring_agg",
            "bool_and",
            "bool_or",
            "count",
            "favg",
            "first",
            "fsum",
            "geomean",
            "histogram",
            "histogram_exact",
            "last",
            "list",
            "max",
            "max_by",
            "min",
            "min_by",
            "product",
            "string_agg",
            "sum",
        },
    },
    "comparison": {
        "all": {">", "<", "=", ">=", "<=", "<>", "!=", "like", "in", "is"},
        "postgresql": {"ilike"},
        "snowflake": {"ilike"},
        "bigquery": {},
        "mysql": {},
        "sqlite": {},
        "duckdb": {"ilike"},
    },
}


class Dialect(BaseModel, use_enum_values=True):
    type: str

    def _get_keyword_store(self, keyword_type: str):
        try:
            store = KEYWORDS[keyword_type]
            _ = store[self.type]
        except KeyError:
            raise f"No {keyword_type} store for {self.type}."
        return deepcopy(store)

    def _dialect_set(self, keyword_store: dict):
        all = keyword_store["all"]
        dialect = keyword_store[self.type]
        all.update(dialect)
        return list(all)

    @property
    def aggregates(self):
        aggregates = self._get_keyword_store("aggregates")
        return self._dialect_set(aggregates)

    @property
    def comparisons(self):
        comparison = self._get_keyword_store("comparison")
        return self._dialect_set(comparison)

    @property
    def aggregates_regex_pattern(self):
        aggregates_with_regex = [rf"{agg}\s*\(.*\)\s*" for agg in self.aggregates]
        return "|".join(aggregates_with_regex)
