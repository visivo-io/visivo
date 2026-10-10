"""Profile in, ShapeCard out (VIS-1412). One classifier for the Explorer and
the agent, so a column is the same kind of thing to both."""

import pytest

from visivo.server.services import shape_card as sc


def col(name, type_, distinct, rows=1000, nulls=0, **extra):
    base = {
        "name": name,
        "type": type_,
        "null_count": nulls,
        "null_percentage": 100 * nulls / rows,
        "distinct": distinct,
        "min": None,
        "max": None,
        "avg": None,
        "median": None,
        "std_dev": None,
        "q25": None,
        "q75": None,
        "p99": None,
        "zeros_pct": None,
        "avg_length": None,
        "top_values": [],
    }
    base.update(extra)
    return base


def card(column, rows=1000):
    return sc.shape_card(column, rows)


def tops(values, count=10):
    return [{"value": v, "count": count} for v in values]


class TestRoles:
    def test_booleans_and_times(self):
        assert card(col("active", "BOOLEAN", 2)).role == "boolean"
        assert card(col("picked_up_at", "TIMESTAMP", 900)).role == "time"
        assert card(col("day", "DATE", 30)).role == "time"

    def test_integer_ids_and_small_counts(self):
        assert card(col("trip_id", "BIGINT", 1000)).role == "identifier"
        assert card(col("passenger_count", "BIGINT", 6)).role == "numeric_discrete"
        assert card(col("pickup_hour", "INTEGER", 24)).role == "numeric_discrete"
        assert card(col("rows", "BIGINT", 400)).role == "numeric_continuous"

    def test_floats_are_measures_unless_named_as_ids(self):
        assert card(col("trip_distance", "DOUBLE", 990)).role == "numeric_continuous"
        assert card(col("rating", "DOUBLE", 5)).role == "numeric_discrete"
        assert card(col("account_id", "DECIMAL(18,0)", 1000)).role == "identifier"

    def test_lat_lon_are_points(self):
        assert card(col("pickup_latitude", "DOUBLE", 990)).geo_kind == "latlon"
        assert card(col("lng", "DOUBLE", 990)).role == "geo_point"

    def test_text_labels_regions_identifiers_and_prose(self):
        assert (
            card(
                col(
                    "payment_type",
                    "VARCHAR",
                    4,
                    avg_length=6,
                    top_values=tops(["card", "cash", "x", "y"]),
                )
            ).role
            == "categorical"
        )
        borough = col(
            "pickup_borough",
            "VARCHAR",
            5,
            avg_length=8,
            top_values=tops(["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]),
        )
        assert (card(borough).role, card(borough).geo_kind) == ("geo_region", "custom")
        state = col("state", "VARCHAR", 3, avg_length=2, top_values=tops(["NY", "CA", "TX"]))
        assert card(state).geo_kind == "us_state"
        assert card(col("uuid", "VARCHAR", 1000, avg_length=36)).role == "identifier"
        assert card(col("comment", "VARCHAR", 1000, avg_length=120)).role == "text"
        assert (
            card(col("zone", "VARCHAR", 2000, rows=5000, avg_length=12), rows=5000).role == "text"
        )

    def test_small_tables_are_never_identifiers(self):
        assert card(col("x", "BIGINT", 6, rows=6), rows=6).role == "numeric_discrete"
        assert card(col("name", "VARCHAR", 6, rows=6, avg_length=5), rows=6).role == "categorical"


class TestCardFields:
    def test_cardinality_bucket_and_nulls(self):
        c = card(col("payment_type", "VARCHAR", 4, nulls=250, avg_length=5))

        assert c.cardinality == 4 and c.cardinality_bucket == "few"
        assert c.null_pct == 0.25

    def test_top_n_shares_are_of_non_null_rows(self):
        c = card(
            col(
                "flag",
                "VARCHAR",
                2,
                nulls=500,
                avg_length=1,
                top_values=tops(["a", "b"], count=250),
            )
        )

        assert [t.share for t in c.top_n] == [0.5, 0.5]

    def test_top_n_is_dropped_where_it_is_noise(self):
        measure = col("fare", "DOUBLE", 900, top_values=tops([1.0, 2.0]))
        ident = col("trip_id", "BIGINT", 1000, top_values=tops([1, 2]))

        assert card(measure).top_n == [] and card(ident).top_n == []
        assert card(col("passengers", "BIGINT", 4, top_values=tops([1, 2]))).top_n != []

    def test_numeric_stats_are_carried_and_skew_is_derived(self):
        c = card(
            col(
                "fare",
                "DOUBLE",
                900,
                min=1.0,
                max=99.0,
                avg=20.0,
                median=14.0,
                std_dev=12.0,
                p99=80.0,
                zeros_pct=0.01,
            )
        )

        assert c.stats.min == 1.0 and c.stats.max == 99.0
        assert c.stats.mean == 20.0 and c.stats.p99 == 80.0 and c.stats.zeros_pct == 0.01
        assert c.stats.skew == pytest.approx(1.5)

    def test_text_min_max_keep_strings_and_no_numeric_stats(self):
        c = card(
            col(
                "state",
                "VARCHAR",
                3,
                min="CA",
                max="TX",
                avg_length=2,
                top_values=tops(["NY", "CA", "TX"]),
            )
        )

        assert c.stats.min == "CA" and c.stats.mean is None

    def test_no_bounds_means_no_stats(self):
        assert card(col("x", "VARCHAR", 3, avg_length=2)).stats is None

    def test_additivity_from_the_name(self):
        assert card(col("fare_amount", "DOUBLE", 900)).additive is True
        assert card(col("tip_rate", "DOUBLE", 900)).additive is False
        assert card(col("mystery", "DOUBLE", 900)).additive is None
        assert card(col("payment_type", "VARCHAR", 4, avg_length=4)).additive is None


class TestTimeGrain:
    def test_days_weeks_months(self):
        assert sc.time_grain_for("2024-01-01", "2024-12-31", 366) == "day"
        assert sc.time_grain_for("2024-01-01", "2024-12-30", 53) == "week"
        assert sc.time_grain_for("2024-01-01", "2024-12-01", 12) == "month"
        assert sc.time_grain_for("2020-01-01", "2024-01-01", 5) == "year"

    def test_hours_and_minutes(self):
        assert sc.time_grain_for("2024-01-01 00:00:00", "2024-01-01 23:00:00", 24) == "hour"
        assert sc.time_grain_for("2024-01-01 00:00:00", "2024-01-01 00:59:00", 60) == "minute"

    def test_degenerate_inputs(self):
        assert sc.time_grain_for(None, "2024-01-01", 5) is None
        assert sc.time_grain_for("2024-01-01", "2024-01-01", 1) is None
        assert sc.time_grain_for("2024-02-01", "2024-01-01", 5) is None
        assert sc.time_grain_for("not a date", "2024-01-01", 5) is None

    def test_the_card_carries_grain_and_points(self):
        import datetime

        c = card(
            col("day", "DATE", 30, min=datetime.date(2024, 1, 1), max=datetime.date(2024, 1, 30))
        )

        assert c.time_grain == "day" and c.time_span_points == 30
        assert c.stats.min == "2024-01-01"


class TestShapeCards:
    def test_every_column_in_order(self):
        profile = {
            "row_count": 100,
            "columns": [
                col("a", "BIGINT", 100, rows=100),
                col("b", "VARCHAR", 3, rows=100, avg_length=3),
            ],
        }

        assert [c.column for c in sc.shape_cards(profile)] == ["a", "b"]

    def test_an_empty_profile(self):
        assert sc.shape_cards({"row_count": 0, "columns": []}) == []

    def test_jsonable_handles_odd_values(self):
        from decimal import Decimal

        assert sc._jsonable(Decimal("1.5")) == 1.5
        assert sc._jsonable(object()).startswith("<object")
