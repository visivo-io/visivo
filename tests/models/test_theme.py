import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from tests.factories.model_factories import ProjectFactory, ThemeFactory
from visivo.models.color_palette import ColorPalette
from visivo.models.project import Project
from visivo.models.theme import Theme

PALETTES_JSON = Path(__file__).parents[2] / "viewer" / "src" / "theme" / "palettes.json"


def test_defaults_to_light_mode_with_toggle():
    theme = Theme()
    assert theme.mode == "light"
    assert theme.allow_viewer_toggle is True


def test_accepts_shared_and_per_mode_tokens():
    theme = Theme(
        mode="auto",
        font_family="Inter, sans-serif",
        colorway=["#0a9396", "#d25946"],
        light={"accent": "#2d6a6f"},
        dark={"background": "#121527", "plotly_layout": {"font": {"size": 14}}},
    )
    assert theme.dark.background == "#121527"
    assert theme.dark.plotly_layout.model_dump()["font"] == {"size": 14}


def test_keeps_palette_names_unexpanded_so_yaml_round_trips():
    name = next(iter(ColorPalette.PREDEFINED_PALETTES))
    assert Theme(colorway=name).model_dump(exclude_none=True)["colorway"] == name


@pytest.mark.parametrize(
    "config, message",
    [
        ({"mode": "sepia"}, "mode"),
        ({"surface": "white"}, "not a hex color"),
        ({"dark": {"text": "#12345"}}, "not a hex color"),
        ({"colorway": "No Such Palette"}, "Unknown palette"),
        ({"colorway": []}, "at least one color"),
        ({"font_size": 4}, "font_size"),
        ({"accents": "#ffffff"}, "Extra inputs are not permitted"),
        ({"plotly_layout": {"paper_bgcolor": 12}}, "layout"),
    ],
)
def test_rejects_invalid_config(config, message):
    with pytest.raises(ValidationError, match=message):
        Theme(**config)


def test_project_round_trips_theme_without_paths():
    project = ProjectFactory(theme=ThemeFactory())
    dumped = json.loads(project.model_dump_json(exclude_none=True))
    assert dumped["theme"] == {
        "mode": "dark",
        "allow_viewer_toggle": True,
        "accent": "#2d6a6f",
        "dark": {"surface": "#1b1f36"},
    }
    assert Project(**dumped).theme == project.theme


def test_viewer_palettes_match_python_palettes():
    assert json.loads(PALETTES_JSON.read_text()) == ColorPalette.PREDEFINED_PALETTES
