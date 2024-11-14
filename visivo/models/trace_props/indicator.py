from pydantic import Field, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.trace_props.trace_props import TraceProps, TracePropsAttribute
from typing import List, Literal, Optional, Any


class DecreasingIncreasing1(TracePropsAttribute):
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the color for increasing value. """
    )
    symbol: Optional[str] = Field(
        None,
        description=""" string<br>Sets the symbol to display for increasing value """,
    )


class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(
    TracePropsAttribute
):
    color: Optional[str] = Field(None, description=""" color<br> """)
    family: Optional[str] = Field(
        None,
        description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number greater than or equal to 1<br> """
    )


class DecreasingIncreasing1(TracePropsAttribute):
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the color for increasing value. """
    )
    symbol: Optional[str] = Field(
        None,
        description=""" string<br>Sets the symbol to display for increasing value """,
    )


class IndicatorDelta(TracePropsAttribute):
    decreasing: Optional[DecreasingIncreasing1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    font: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Set the font used to display the delta """,
    )
    increasing: Optional[DecreasingIncreasing1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    position: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "top" | "bottom" | "left" | "right" )<br>Sets the position of delta with respect to the number. """,
    )
    prefix: Optional[str] = Field(
        None, description=""" string<br>Sets a prefix appearing before the delta. """
    )
    reference: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the reference value to compute the delta. By default, it is set to the current value. """,
    )
    relative: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" boolean<br>Show relative change """
    )
    suffix: Optional[str] = Field(
        None, description=""" string<br>Sets a suffix appearing next to the delta. """
    )
    valueformat: Optional[str] = Field(
        None,
        description=""" string<br>Sets the value formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. """,
    )


class Domain12(TracePropsAttribute):
    column: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this column in the grid for this indicator trace . """,
    )
    row: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this row in the grid for this indicator trace . """,
    )
    x: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" array<br>Sets the horizontal domain of this indicator trace (in plot fraction). """,
    )
    y: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" array<br>Sets the vertical domain of this indicator trace (in plot fraction). """,
    )


class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(
    TracePropsAttribute
):
    color: Optional[str] = Field(None, description=""" color<br> """)
    family: Optional[str] = Field(
        None,
        description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number greater than or equal to 1<br> """
    )


class Tickformatstops1(TracePropsAttribute):
    dtickrange: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" array<br>range ["min", "max"], where "min", "max" - dtick values which describe some zoom level, it is possible to omit "min" or "max" value by passing "null" """,
    )
    enabled: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not this stop is used. If `false`, this stop is ignored even within its `dtickrange`. """,
    )
    name: Optional[str] = Field(
        None,
        description=""" string<br>When used in a template, named items are created in the output figure in addition to any items the figure already has in this array. You can modify these items in the output figure by making your own item with `templateitemname` matching this `name` alongside your modifications (including `visible: false` or `enabled: false` to hide it). Has no effect outside of a template. """,
    )
    templateitemname: Optional[str] = Field(
        None,
        description=""" string<br>Used to refer to a named item in this array in the template. Named items from the template will be created even without a matching item in the input figure, but you can modify one by making an item with `templateitemname` matching its `name`, alongside your modifications (including `visible: false` or `enabled: false` to hide it). If there is no template or no matching item, this item will be hidden unless you explicitly show it with `visible: true`. """,
    )
    value: Optional[str] = Field(
        None,
        description=""" string<br>string - dtickformat for described zoom level, the same as "tickformat" """,
    )


class IndicatorGaugeAxis(TracePropsAttribute):
    dtick: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Sets the step in-between ticks on this axis. Use with `tick0`. Must be a positive number, or special strings available to "log" and "date" axes. If the axis `type` is "log", then ticks are set every 10^(n"dtick) where n is the tick number. For example, to set a tick mark at 1, 10, 100, 1000, ... set dtick to 1. To set tick marks at 1, 100, 10000, ... set dtick to 2. To set tick marks at 1, 5, 25, 125, 625, 3125, ... set dtick to log_10(5), or 0.69897000433. "log" has several special values; "L<f>", where `f` is a positive number, gives ticks linearly spaced in value (but not position). For example `tick0` = 0.1, `dtick` = "L0.5" will put ticks at 0.1, 0.6, 1.1, 1.6 etc. To show powers of 10 plus small digits between, use "D1" (all digits) or "D2" (only 2 and 5). `tick0` is ignored for "D1" and "D2". If the axis `type` is "date", then you must convert the time to milliseconds. For example, to set the interval between ticks to one day, set `dtick` to 86400000.0. "date" also has special values "M<n>" gives ticks spaced by a number of months. `n` must be a positive integer. To set ticks on the 15th of every third month, set `tick0` to "2000-01-15" and `dtick` to "M3". To set ticks every 4 years, set `dtick` to "M48" """,
    )
    exponentformat: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "none" | "e" | "e" | "power" | "si" | "b" )<br>Determines a formatting rule for the tick exponents. For example, consider the number 1,000,000,000. If "none", it appears as 1,000,000,000. If "e", 1e+9. If "E", 1E+9. If "power", 1x10^9 (with 9 in a super script). If "SI", 1G. If "B", 1B. """,
    )
    minexponent: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Hide SI prefix for 10^n if |n| is below this number. This only has an effect when `tickformat` is "SI" or "B". """,
    )
    nticks: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" integer greater than or equal to 0<br>Specifies the maximum number of ticks for the particular axis. The actual number of ticks will be chosen automatically to be less than or equal to `nticks`. Has an effect only if `tickmode` is set to "auto". """,
    )
    range: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" array<br>Sets the range of this axis. """
    )
    separatethousands: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>If "true", even 4-digit integers are separated """,
    )
    showexponent: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "all" | "first" | "last" | "none" )<br>If "all", all exponents are shown besides their significands. If "first", only the exponent of the first tick is shown. If "last", only the exponent of the last tick is shown. If "none", no exponents appear. """,
    )
    showticklabels: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not the tick labels are drawn. """,
    )
    showtickprefix: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "all" | "first" | "last" | "none" )<br>If "all", all tick labels are displayed with a prefix. If "first", only the first tick is displayed with a prefix. If "last", only the last tick is displayed with a suffix. If "none", tick prefixes are hidden. """,
    )
    showticksuffix: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "all" | "first" | "last" | "none" )<br>Same as `showtickprefix` but for tick suffixes. """,
    )
    tick0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Sets the placement of the first tick on this axis. Use with `dtick`. If the axis `type` is "log", then you must take the log of your starting tick (e.g. to set the starting tick to 100, set the `tick0` to 2) except when `dtick`="L<f>" (see `dtick` for more info). If the axis `type` is "date", it should be a date string, like date data. If the axis `type` is "category", it should be a number, using the scale where each category is assigned a serial number from zero in the order it appears. """,
    )
    tickangle: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" angle<br>Sets the angle of the tick labels with respect to the horizontal. For example, a `tickangle` of -90 draws the tick labels vertically. """,
    )
    tickcolor: Optional[str] = Field(
        None, description=""" color<br>Sets the tick color. """
    )
    tickfont: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets the color bar's tick label font """,
    )
    tickformat: Optional[str] = Field(
        None,
        description=""" string<br>Sets the tick label formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. And for dates see: https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format. We add two items to d3's date formatter: "%h" for half of the year as a decimal number as well as "%{n}f" for fractional seconds with n digits. For example, "2016-10-13 09:15:23.456" with tickformat "%H~%M~%S.%2f" would display "09~15~23.46" """,
    )
    tickformatstops: Optional[List[Tickformatstops1]] = Field(
        None,
        description=""" array of object where each object has one or more of the keys listed below.<br> """,
    )
    ticklabelstep: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" integer greater than or equal to 1<br>Sets the spacing between tick labels as compared to the spacing between ticks. A value of 1 (default) means each tick gets a label. A value of 2 means shows every 2nd label. A larger value n means only every nth tick is labeled. `tick0` determines which labels are shown. Not implemented for axes with `type` "log" or "multicategory", or when `tickmode` is "array". """,
    )
    ticklen: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the tick length (in px). """,
    )
    tickmode: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "auto" | "linear" | "array" )<br>Sets the tick mode for this axis. If "auto", the number of ticks is set via `nticks`. If "linear", the placement of the ticks is determined by a starting position `tick0` and a tick step `dtick` ("linear" is the default value if `tick0` and `dtick` are provided). If "array", the placement of the ticks is set via `tickvals` and the tick text is `ticktext`. ("array" is the default value if `tickvals` is provided). """,
    )
    tickprefix: Optional[str] = Field(
        None, description=""" string<br>Sets a tick label prefix. """
    )
    ticks: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "outside" | "inside" | "" )<br>Determines whether ticks are drawn or not. If "", this axis' ticks are not drawn. If "outside" ("inside"), this axis' are drawn outside (inside) the axis lines. """,
    )
    ticksuffix: Optional[str] = Field(
        None, description=""" string<br>Sets a tick label suffix. """
    )
    ticktext: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Sets the text displayed at the ticks position via `tickvals`. Only has an effect if `tickmode` is set to "array". Used with `tickvals`. """,
    )
    tickvals: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Sets the values at which ticks on this axis appear. Only has an effect if `tickmode` is set to "array". Used with `ticktext`. """,
    )
    tickwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the tick width (in px). """,
    )
    visible: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>A single toggle to hide the axis while preserving interaction like dragging. Default is true when a cheater plot is present on the axis, otherwise false """,
    )


class Line11(TracePropsAttribute):
    color: Optional[str] = Field(
        None,
        description=""" color<br>Sets the color of the line enclosing each sector. """,
    )
    width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) of the line enclosing each sector. """,
    )


class IndicatorGaugeBar(TracePropsAttribute):
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the background color of the arc. """
    )
    line: Optional[Line11] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to 0 and 1<br>Sets the thickness of the bar as a fraction of the total thickness of the gauge. """,
    )


class Line11(TracePropsAttribute):
    color: Optional[str] = Field(
        None,
        description=""" color<br>Sets the color of the line enclosing each sector. """,
    )
    width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) of the line enclosing each sector. """,
    )


class IndicatorGaugeSteps(TracePropsAttribute):
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the background color of the arc. """
    )
    line: Optional[Line11] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    name: Optional[str] = Field(
        None,
        description=""" string<br>When used in a template, named items are created in the output figure in addition to any items the figure already has in this array. You can modify these items in the output figure by making your own item with `templateitemname` matching this `name` alongside your modifications (including `visible: false` or `enabled: false` to hide it). Has no effect outside of a template. """,
    )
    range: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" array<br>Sets the range of this axis. """
    )
    templateitemname: Optional[str] = Field(
        None,
        description=""" string<br>Used to refer to a named item in this array in the template. Named items from the template will be created even without a matching item in the input figure, but you can modify one by making an item with `templateitemname` matching its `name`, alongside your modifications (including `visible: false` or `enabled: false` to hide it). If there is no template or no matching item, this item will be hidden unless you explicitly show it with `visible: true`. """,
    )
    thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to 0 and 1<br>Sets the thickness of the bar as a fraction of the total thickness of the gauge. """,
    )


class Line23(TracePropsAttribute):
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the color of the threshold line. """
    )
    width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) of the threshold line. """,
    )


class IndicatorGaugeThreshold(TracePropsAttribute):
    line: Optional[Line23] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to 0 and 1<br>Sets the thickness of the threshold line as a fraction of the thickness of the gauge. """,
    )
    value: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number<br>Sets a threshold value drawn as a line. """
    )


class IndicatorGauge(TracePropsAttribute):
    axis: Optional[IndicatorGaugeAxis] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    bar: Optional[IndicatorGaugeBar] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Set the appearance of the gauge's value """,
    )
    bgcolor: Optional[str] = Field(
        None, description=""" color<br>Sets the gauge background color. """
    )
    bordercolor: Optional[str] = Field(
        None,
        description=""" color<br>Sets the color of the border enclosing the gauge. """,
    )
    borderwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) of the border enclosing the gauge. """,
    )
    shape: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "angular" | "bullet" )<br>Set the shape of the gauge """,
    )
    steps: Optional[List[IndicatorGaugeSteps]] = Field(
        None,
        description=""" array of object where each object has one or more of the keys listed below.<br> """,
    )
    threshold: Optional[IndicatorGaugeThreshold] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )


class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(
    TracePropsAttribute
):
    color: Optional[str] = Field(None, description=""" color<br> """)
    family: Optional[str] = Field(
        None,
        description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number greater than or equal to 1<br> """
    )


class IndicatorLegendgrouptitle(TracePropsAttribute):
    font: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets this legend group's title font. """,
    )
    text: Optional[str] = Field(
        None, description=""" string<br>Sets the title of the legend group. """
    )


class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(
    TracePropsAttribute
):
    color: Optional[str] = Field(None, description=""" color<br> """)
    family: Optional[str] = Field(
        None,
        description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number greater than or equal to 1<br> """
    )


class IndicatorNumber(TracePropsAttribute):
    font: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Set the font used to display main number """,
    )
    prefix: Optional[str] = Field(
        None, description=""" string<br>Sets a prefix appearing before the number. """
    )
    suffix: Optional[str] = Field(
        None, description=""" string<br>Sets a suffix appearing next to the number. """
    )
    valueformat: Optional[str] = Field(
        None,
        description=""" string<br>Sets the value formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. """,
    )


class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(
    TracePropsAttribute
):
    color: Optional[str] = Field(None, description=""" color<br> """)
    family: Optional[str] = Field(
        None,
        description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number greater than or equal to 1<br> """
    )


class IndicatorTitle(TracePropsAttribute):
    align: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "left" | "center" | "right" )<br>Sets the horizontal alignment of the title. It defaults to `center` except for bullet charts for which it defaults to right. """,
    )
    font: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Set the font used to display the title """,
    )
    text: Optional[str] = Field(
        None, description=""" string<br>Sets the title of this indicator. """
    )


class Indicator(TraceProps):
    align: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "left" | "center" | "right" )<br>Sets the horizontal alignment of the `text` within the box. Note that this attribute has no effect if an angular gauge is displayed: in this case, it is always centered """,
    )
    customdata: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Assigns extra data each datum. This may be useful when listening to hover, click and selection events. Note that, "scatter" traces also appends customdata items in the markers DOM elements """,
    )
    delta: Optional[IndicatorDelta] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    domain: Optional[Domain12] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    gauge: Optional[IndicatorGauge] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>The gauge of the Indicator plot. """,
    )
    ids: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Assigns id labels to each datum. These ids for object constancy of data points during animation. Should be an array of strings, not numbers or any other type. """,
    )
    legendgrouptitle: Optional[IndicatorLegendgrouptitle] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    legendrank: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the legend rank for this trace. Items and groups with smaller ranks are presented on top/left side while with `"reversed" `legend.traceorder` they are on bottom/right side. The default legendrank is 1000, so that you can use ranks less than 1000 to place certain items before all unranked items, and ranks greater than 1000 to go after all unranked items. """,
    )
    legendwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px or fraction) of the legend for this trace. """,
    )
    meta: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Assigns extra meta information associated with this trace that can be used in various text attributes. Attributes such as trace `name`, graph, axis and colorbar `title.text`, annotation `text` `rangeselector`, `updatemenues` and `sliders` `label` text all support `meta`. To access the trace `meta` values in an attribute in the same trace, simply use `%{meta[i]}` where `i` is the index or key of the `meta` item in question. To access trace `meta` in layout attributes, use `%{data[n[.meta[i]}` where `i` is the index or key of the `meta` and `n` is the trace index. """,
    )
    mode: Optional[str] = Field(
        None,
        description=""" flaglist string. any combination of "number", "delta", "gauge" joined with a "+"<br>Determines how the value is displayed on the graph. `number` displays the value numerically in text. `delta` displays the difference to a reference value in text. Finally, `gauge` displays the value graphically on an axis. """,
    )
    number: Optional[IndicatorNumber] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    title: Optional[IndicatorTitle] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    type: Literal["indicator"] = Field(..., description=""" "indicator"<br> """)
    uirevision: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Controls persistence of some user-driven changes to the trace: `constraintrange` in `parcoords` traces, as well as some `editable: true` modifications such as `name` and `colorbar.title`. Defaults to `layout.uirevision`. Note that other user-driven trace attribute changes are controlled by `layout` attributes: `trace.visible` is controlled by `layout.legend.uirevision`, `selectedpoints` is controlled by `layout.selectionrevision`, and `colorbar.(x|y)` (accessible with `config: {editable: true}`) is controlled by `layout.editrevision`. Trace changes are tracked by `uid`, which only falls back on trace index if no `uid` is provided. So if your app can add/remove traces before the end of the `data` array, such that the same trace has a different index, you can still preserve user-driven changes if you give each trace a `uid` that stays with it as it moves. """,
    )
    value: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number<br>Sets the number to be displayed. """
    )
    visible: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( true | false | "legendonly" )<br>Determines whether or not this trace is visible. If "legendonly", the trace is not drawn, but can appear as a legend item (provided that the legend itself is visible). """,
    )
