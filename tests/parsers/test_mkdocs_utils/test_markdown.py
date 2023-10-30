from visivo.parsers.mkdocs_utils import markdown

MODEL_DEFS = {
    "HeightEnum": {
        "enum": ["small", "medium", "large"],
        "title": "HeightEnum",
        "type": "string",
    },
    "Model": {
        "additionalProperties": False,
        "description": "Models are queries that return base data that is used in Traces",
        "properties": {
            "name": {
                "anyOf": [{"type": "string"}, {"type": "null"}],
                "default": None,
                "description": "Name of the model",
                "title": "Name",
            },
            "sql": {
                "default": None,
                "description": "The sql used to generate your base data",
                "title": "Sql",
                "type": "string",
            },
        },
        "title": "Model",
        "type": "object",
    },
}


def test_find_refs():
    has_ref = {"foo": "bar", "fin": {"bats": [1, {"$ref": "model"}]}}
    assert ["model"] == markdown.find_refs(has_ref)

    no_ref = {"foo": "bar"}
    assert [] == markdown.find_refs(no_ref)


def test_handle_attribute_properties_allOf():
    allOf_property = {
        "allOf": [{"$ref": "#/$defs/HeightEnum"}],
        "default": "medium",
        "description": "Sets the height of the row.",
    }
    type, description, default = markdown.handle_attribute_properties(
        MODEL_DEFS, allOf_property
    )
    assert type == "Enumerated - one of: small, medium, large"
    assert description == "Sets the height of the row."
    assert default == "medium"


def test_handle_attribute_properties_anyOf():
    anyOf_property = {
        "anyOf": [
            {"pattern": "^ref\\(\\s*([a-zA-Z0-9\\s'\\\"\\-_]+)\\)$", "type": "string"},
            {"$ref": "#/$defs/Model"},
        ],
        "description": "The model or model ref that visivo should use to build the trace.",
        "title": "Model",
    }
    type, description, default = markdown.handle_attribute_properties(
        MODEL_DEFS, anyOf_property
    )
    assert type == "#/$defs/Model"
    assert (
        description
        == "The model or model ref that visivo should use to build the trace."
    )
    assert default == "None"


def test_handle_attribute_properties_items():
    items_property = {
        "default": None,
        "description": "A list of items containing tables, charts or markdown. Items are placed in the row in the order that they are listed from left to right.",
        "items": {"$ref": "#/$defs/Item"},
        "title": "Items",
        "type": "array",
    }
    type, description, default = markdown.handle_attribute_properties(
        MODEL_DEFS, items_property
    )
    assert type == "Array of #/$defs/Item"
    assert (
        description
        == "A list of items containing tables, charts or markdown. Items are placed in the row in the order that they are listed from left to right."
    )
    assert default == "None"


def test_handle_attribute_properties_discriminator():
    discriminator_property = {
        "default": {
            "cliponaxis": None,
            "connectgaps": None,
            "customdata": None,
            "type": "scatter",
        },
        "discriminator": {
            "mapping": {
                "bar": "#/$defs/Bar",
                "barpolar": "#/$defs/Barpolar",
                "scatter": "#/$defs/Scatter",
            },
            "propertyName": "type",
        },
        "oneOf": [
            {"$ref": "#/$defs/Bar"},
            {"$ref": "#/$defs/Barpolar"},
            {"$ref": "#/$defs/Scatter"},
        ],
        "title": "Props",
    }
    type, description, default = markdown.handle_attribute_properties(
        MODEL_DEFS, discriminator_property
    )
    print(type)
    assert (
        type == "One of:<br>  •#/$defs/Bar<br>  •#/$defs/Barpolar<br>  •#/$defs/Scatter"
    )
    assert description == ""
    assert default == "#/$defs/Scatter"
