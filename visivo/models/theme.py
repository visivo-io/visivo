import re
from typing import List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator
from visivo.models.color_palette import ColorPalette
from visivo.models.props.layout import Layout

HEX_COLOR_PATTERN = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

ColorField = Optional[str]


def _color_field(description: str):
    return Field(None, description=f"{description} Hex color, e.g. `#1d2136`.")


class ThemeTokens(BaseModel):
    """
    The visual tokens a theme can set. Any token left unset falls back to Visivo's built-in light
    or dark theme.
    """

    model_config = ConfigDict(extra="forbid")

    colorway: Optional[Union[str, List[str]]] = Field(
        None,
        description="Series colors, assigned to traces in order. Either a list of colors or the name "
        "of a predefined palette.",
    )
    font_family: Optional[str] = Field(
        None, description="CSS font stack used by charts, tables and markdown."
    )
    font_size: Optional[int] = Field(
        None, ge=8, le=32, description="Base font size in pixels for chart text."
    )
    background: ColorField = _color_field("Page background behind dashboard items.")
    surface: ColorField = _color_field("Background of charts, tables and other dashboard cards.")
    text: ColorField = _color_field("Primary text color.")
    muted_text: ColorField = _color_field("Secondary text, axis ticks and labels.")
    border: ColorField = _color_field("Card borders and axis lines.")
    grid: ColorField = _color_field("Chart gridlines.")
    accent: ColorField = _color_field(
        "Highlight color for selected inputs, gauges and table hover rows."
    )
    plotly_layout: Optional[Layout] = Field(
        None,
        description="Plotly layout properties merged into every chart's template. A chart's own "
        "`layout` still takes precedence.",
    )

    @field_validator(
        "background", "surface", "text", "muted_text", "border", "grid", "accent", mode="after"
    )
    @classmethod
    def validate_hex_color(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not HEX_COLOR_PATTERN.match(value):
            raise ValueError(f"'{value}' is not a hex color like #1d2136")
        return value

    @field_validator("colorway", mode="after")
    @classmethod
    def validate_colorway(cls, value):
        if isinstance(value, str) and value not in ColorPalette.PREDEFINED_PALETTES:
            raise ValueError(
                f"Unknown palette '{value}'. Choose from: "
                f"{', '.join(ColorPalette.PREDEFINED_PALETTES.keys())}"
            )
        if isinstance(value, list) and not value:
            raise ValueError("colorway must contain at least one color")
        return value


class ThemeMode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["light", "dark", "auto"] = Field(
        "light",
        description="The mode dashboards open in. `auto` follows the viewer's operating system "
        "setting.",
    )
    allow_viewer_toggle: bool = Field(
        True,
        description="Show the light / dark / auto switch on dashboards so viewers can pick their "
        "own mode.",
    )


# ThemeMode is listed last so its fields come first when a theme is written back to YAML.
class Theme(ThemeTokens, ThemeMode):
    """
    A theme controls how dashboards look: chart colors, fonts and the surfaces behind charts,
    tables, markdown and inputs. Visivo ships a built-in light and dark theme; a project theme
    overrides individual tokens of either.

    Tokens set at the top level apply to both modes. Tokens under `light` or `dark` apply only to
    that mode and win over the shared ones. A chart's own `layout` always wins over the theme.

    ``` yaml
    theme:
      mode: auto
      font_family: "Inter, system-ui, sans-serif"
      colorway: ["#0a9396", "#d25946", "#5b4bab", "#4f9a3f"]
      light:
        accent: "#2d6a6f"
      dark:
        background: "#121527"
        plotly_layout:
          geo:
            showocean: true
    ```
    """

    light: Optional[ThemeTokens] = Field(None, description="Tokens used only in light mode.")
    dark: Optional[ThemeTokens] = Field(None, description="Tokens used only in dark mode.")
