"""A relation can declare its cardinality and a SQL model its primary key. A
cardinality that disagrees with a declared primary key is refused (VIS-1718)."""

import pytest
from pydantic import ValidationError

from tests.factories.model_factories import SourceFactory
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.relation import Relation
from visivo.models.relation_keys import (
    cardinality_error,
    cardinality_models,
    condition_models,
    declared_many_side,
    declared_unique,
    join_keys,
    joins_on_primary_key,
    primary_key_columns,
)

CONDITION = "${ref(orders).user_id} = ${ref(users).id}"
OTHER_KEY = "${ref(orders).alt_id} = ${ref(users).alt_id}"
NOT_AN_AND_OF_EQUALITIES = [
    f"{CONDITION} OR {OTHER_KEY}",
    f"NOT ({CONDITION})",
    f"({CONDITION} AND {OTHER_KEY}) OR ${{ref(orders).vip}}",
    f"NOT ({CONDITION} AND {OTHER_KEY})",
    f"({CONDITION}) = false",
]


def _model(name, primary_key=None):
    return SqlModel(name=name, sql=f"select * from {name}", primary_key=primary_key)


def _relation(cardinality=None, condition=CONDITION):
    return Relation(name="orders_to_users", condition=condition, cardinality=cardinality)


def _lookup(*models):
    return {model.name: model for model in models}.get


class TestFields:
    def test_both_fields_are_optional(self):
        assert _relation().cardinality is None
        assert _model("orders").primary_key is None

    @pytest.mark.parametrize("value", ["many_to_one", "one_to_many", "one_to_one"])
    def test_a_relation_takes_each_cardinality(self, value):
        assert _relation(value).cardinality == value

    def test_many_to_many_is_not_a_cardinality(self):
        with pytest.raises(ValidationError):
            _relation("many_to_many")

    def test_a_cardinality_needs_exactly_two_models(self):
        three = "${ref(a).x} = ${ref(b).x} AND ${ref(b).y} = ${ref(c).y}"
        assert _relation(condition=three).cardinality is None
        with pytest.raises(ValidationError, match="names exactly two models"):
            _relation("many_to_one", three)

    def test_a_primary_key_is_one_column_or_a_list(self):
        assert primary_key_columns(_model("orders", "id")) == ["id"]
        assert primary_key_columns(_model("orders", ["a", "b"])) == ["a", "b"]
        assert primary_key_columns(_model("orders")) == []

    @pytest.mark.parametrize("value", ["", " ", [], ["id", ""]])
    def test_an_empty_primary_key_is_refused(self, value):
        with pytest.raises(ValidationError, match="at least one column"):
            _model("orders", value)

    @pytest.mark.parametrize("value", [["id", "ID"], ["id ", " id"]])
    def test_a_repeated_primary_key_column_is_refused(self, value):
        with pytest.raises(ValidationError, match="more than once"):
            _model("orders", value)

    def test_a_primary_key_drops_the_space_around_a_name(self):
        assert _model("users", " id ").primary_key == "id"
        assert _model("users", [" id", "region "]).primary_key == ["id", "region"]
        assert joins_on_primary_key(_model("users", " id "), ["id"])

    @pytest.mark.parametrize("value", ['"id"', "'id'", "`id`", "users.id", ["region", "users.id"]])
    def test_a_primary_key_is_the_name_of_the_column_only(self, value):
        with pytest.raises(ValidationError, match="must be the name of the column only"):
            _model("users", value)

    def test_the_fields_survive_a_dump(self):
        assert _relation("one_to_one").model_dump(exclude_none=True)["cardinality"] == "one_to_one"
        assert _model("orders", ["a", "b"]).model_dump(exclude_none=True)["primary_key"] == [
            "a",
            "b",
        ]


class TestDeclaredSides:
    def test_models_come_in_the_order_the_condition_names_them(self):
        assert condition_models(CONDITION) == ["orders", "users"]
        assert condition_models("${ref(users).id} = ${ref(orders).user_id}") == ["users", "orders"]

    def test_a_cardinality_reads_in_the_order_of_the_join_equality(self):
        assert cardinality_models(CONDITION) == ["orders", "users"]
        assert cardinality_models("${ref(users).id} = ${ref(orders).user_id}") == [
            "users",
            "orders",
        ]

    @pytest.mark.parametrize(
        "condition",
        [
            f"${{ref(users).active}} = true AND {CONDITION}",
            f"${{ref(users).active}} AND ({CONDITION})",
            f"{CONDITION} AND ${{ref(users).active}} = true",
        ],
    )
    def test_a_filter_does_not_change_the_order(self, condition):
        assert cardinality_models(condition) == ["orders", "users"]
        assert declared_many_side(_relation("many_to_one", condition)) == "orders"
        lookup = _lookup(_model("users", "id"))
        assert cardinality_error(_relation("many_to_one", condition), lookup) is None
        assert "many 'users' rows" in cardinality_error(_relation("one_to_many", condition), lookup)

    def test_a_condition_with_no_join_equality_reads_in_the_order_it_names_the_models(self):
        condition = "${ref(orders).placed_at} > ${ref(users).created_at}"
        assert cardinality_models(condition) == ["orders", "users"]
        assert declared_many_side(_relation("one_to_many", condition)) == "users"

    def test_the_many_side_reads_left_to_right(self):
        assert declared_many_side(_relation("many_to_one")) == "orders"
        assert declared_many_side(_relation("one_to_many")) == "users"
        assert declared_many_side(_relation("one_to_one")) is None
        assert declared_many_side(_relation()) is None

    def test_a_cardinality_declares_both_sides(self):
        assert declared_unique(_relation("many_to_one"), _lookup()) == {
            "orders": False,
            "users": True,
        }
        assert declared_unique(_relation("one_to_one"), _lookup()) == {
            "orders": True,
            "users": True,
        }

    def test_a_join_on_a_primary_key_declares_that_side_unique(self):
        lookup = _lookup(_model("orders", "order_id"), _model("users", "id"))
        assert declared_unique(_relation(), lookup) == {"orders": None, "users": True}

    @pytest.mark.parametrize("condition", NOT_AN_AND_OF_EQUALITIES)
    def test_an_equality_below_an_or_or_a_not_is_not_a_join_key(self, condition):
        lookup = _lookup(_model("orders", "user_id"), _model("users", "id"))
        assert join_keys(condition) == {}
        assert declared_unique(_relation(condition=condition), lookup) == {
            "orders": None,
            "users": None,
        }

    def test_the_terms_of_an_and_chain_are_join_keys(self):
        condition = f"(({CONDITION}) AND ${{ref(users).active}}) AND ({OTHER_KEY})"
        assert join_keys(condition) == {"orders": ["user_id", "alt_id"], "users": ["id", "alt_id"]}

    def test_nothing_declared_says_nothing(self):
        lookup = _lookup(_model("orders"), _model("users"))
        assert declared_unique(_relation(), lookup) == {"orders": None, "users": None}

    def test_a_composite_primary_key_needs_every_column(self):
        users = _model("users", ["id", "region"])
        assert not joins_on_primary_key(users, ["id"])
        assert joins_on_primary_key(users, ["region", "ID", "extra"])
        assert not joins_on_primary_key(_model("users"), ["id"])


class TestCardinalityError:
    def test_a_many_side_joined_on_its_primary_key_is_an_error(self):
        error = cardinality_error(_relation("one_to_many"), _lookup(_model("users", "id")))
        assert error == (
            "Relation 'orders_to_users' declares cardinality 'one_to_many', so one 'orders' "
            "row matches many 'users' rows. But the condition joins 'users' on its "
            "primary_key (id), so each key matches one 'users' row. Change the cardinality "
            "of the relation, or correct the primary_key of model 'users'."
        )

    def test_the_agreeing_cardinalities_pass(self):
        lookup = _lookup(_model("orders", "order_id"), _model("users", "id"))
        for value in ("many_to_one", "one_to_one", None):
            assert cardinality_error(_relation(value), lookup) is None

    def test_a_primary_key_the_join_does_not_use_passes(self):
        lookup = _lookup(_model("orders", "order_id"), _model("users", "email"))
        assert cardinality_error(_relation("one_to_many"), lookup) is None

    @pytest.mark.parametrize("condition", NOT_AN_AND_OF_EQUALITIES)
    def test_a_primary_key_below_an_or_or_a_not_passes(self, condition):
        lookup = _lookup(_model("orders", "user_id"), _model("users", "id"))
        for value in ("one_to_many", "many_to_one"):
            assert cardinality_error(_relation(value, condition), lookup) is None

    def test_an_unknown_model_passes(self):
        assert cardinality_error(_relation("one_to_many"), _lookup()) is None


class TestProjectValidation:
    def _project(self, cardinality, primary_key):
        source = SourceFactory()
        models = [
            SqlModel(name="orders", sql="select * from orders", source=f"ref({source.name})"),
            SqlModel(
                name="users",
                sql="select * from users",
                source=f"ref({source.name})",
                primary_key=primary_key,
            ),
        ]
        return Project(
            name="test_project",
            sources=[source],
            models=models,
            relations=[_relation(cardinality)],
            dashboards=[],
        )

    def test_a_project_with_neither_field_stays_valid(self):
        assert self._project(None, None) is not None

    def test_a_project_with_agreeing_fields_is_valid(self):
        assert self._project("many_to_one", "id") is not None

    def test_a_project_with_a_contradiction_does_not_compile(self):
        with pytest.raises(ValueError, match="declares cardinality 'one_to_many'"):
            self._project("one_to_many", "id")
