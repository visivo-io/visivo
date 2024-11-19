from visivo.models.color_palette import ColorPalette
import pytest

def test_default_palette():
    palette = ColorPalette()
    assert palette.palette == "Warm Earth Tones"

def test_custom_color_list():
    colors = ["#000000", "#FFFFFF", "#FF0000"]
    palette = ColorPalette(palette=colors)
    assert palette.palette == colors

def test_predefined_palette_name():
    palette = ColorPalette(palette="Sunset Over Water")
    assert palette.palette == ColorPalette.PREDEFINED_PALETTES["Sunset Over Water"]

def test_invalid_palette_name():
    with pytest.raises(ValueError) as exc_info:
        ColorPalette(palette="NonExistentPalette")
    assert "Invalid palette name" in str(exc_info.value)
    assert "Choose from:" in str(exc_info.value)

def test_invalid_color_list_type():
    with pytest.raises(ValueError) as exc_info:
        ColorPalette(palette=[1, 2, 3])  # Numbers instead of strings
    assert "All colors must be strings" in str(exc_info.value)

def test_invalid_palette_type():
    with pytest.raises(ValueError) as exc_info:
        ColorPalette(palette=123)  # Integer instead of string or list
    assert "colors must be either a palette name or list of colors" in str(exc_info.value)

def test_none_palette():
    data = {"palette": None}
    validated_data = ColorPalette.validate_palette(data)
    assert validated_data == data
