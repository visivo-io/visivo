from pydantic import Field, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.trace_props.trace_props import TraceProps, TracePropsAttribute
from typing import List, Literal, Optional, Any


class BarError_x(TracePropsAttribute):
    array: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Sets the data corresponding the length of each error bar. Values are plotted relative to the underlying data. """,
    )
    arrayminus: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Sets the data corresponding the length of each error bar in the bottom (left) direction for vertical (horizontal) bars Values are plotted relative to the underlying data. """,
    )
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the stoke color of the error bars. """
    )
    copy_ystyle: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" boolean<br> """
    )
    symmetric: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not the error bars have the same length in both direction (top/bottom for vertical bars, left/right for horizontal bars. """,
    )
    thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the thickness (in px) of the error bars. """,
    )
    traceref: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" integer greater than or equal to 0<br> """
    )
    tracerefminus: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" integer greater than or equal to 0<br> """
    )
    type: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "percent" | "constant" | "sqrt" | "data" )<br>Determines the rule used to generate the error bars. If "constant`, the bar lengths are of a constant value. Set this constant in `value`. If "percent", the bar lengths correspond to a percentage of underlying data. Set this percentage in `value`. If "sqrt", the bar lengths correspond to the square of the underlying data. If "data", the bar lengths are set with data set `array`. """,
    )
    value: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the value of either the percentage (if `type` is set to "percent") or the constant (if `type` is set to "constant") corresponding to the lengths of the error bars. """,
    )
    valueminus: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the value of either the percentage (if `type` is set to "percent") or the constant (if `type` is set to "constant") corresponding to the lengths of the error bars in the bottom (left) direction for vertical (horizontal) bars """,
    )
    visible: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not this set of error bars is visible. """,
    )
    width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) of the cross-bar at both ends of the error bars. """,
    )


class BarError_y(TracePropsAttribute):
    array: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Sets the data corresponding the length of each error bar. Values are plotted relative to the underlying data. """,
    )
    arrayminus: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Sets the data corresponding the length of each error bar in the bottom (left) direction for vertical (horizontal) bars Values are plotted relative to the underlying data. """,
    )
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the stoke color of the error bars. """
    )
    symmetric: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not the error bars have the same length in both direction (top/bottom for vertical bars, left/right for horizontal bars. """,
    )
    thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the thickness (in px) of the error bars. """,
    )
    traceref: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" integer greater than or equal to 0<br> """
    )
    tracerefminus: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" integer greater than or equal to 0<br> """
    )
    type: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "percent" | "constant" | "sqrt" | "data" )<br>Determines the rule used to generate the error bars. If "constant`, the bar lengths are of a constant value. Set this constant in `value`. If "percent", the bar lengths correspond to a percentage of underlying data. Set this percentage in `value`. If "sqrt", the bar lengths correspond to the square of the underlying data. If "data", the bar lengths are set with data set `array`. """,
    )
    value: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the value of either the percentage (if `type` is set to "percent") or the constant (if `type` is set to "constant") corresponding to the lengths of the error bars. """,
    )
    valueminus: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the value of either the percentage (if `type` is set to "percent") or the constant (if `type` is set to "constant") corresponding to the lengths of the error bars in the bottom (left) direction for vertical (horizontal) bars """,
    )
    visible: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not this set of error bars is visible. """,
    )
    width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) of the cross-bar at both ends of the error bars. """,
    )


class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
    color: Optional[str | List[str]] = Field(
        None, description=""" color or array of colors<br> """
    )
    family: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 1<br> """,
    )


class BarHoverlabel(TracePropsAttribute):
    align: Optional[str | List[str]] = Field(
        None,
        description=""" enumerated or array of enumerateds , one of ( "left" | "right" | "auto" )<br>Sets the horizontal alignment of the text content within hover label box. Has an effect only if the hover label text spans more two or more lines """,
    )
    bgcolor: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the background color of the hover labels for this trace """,
    )
    bordercolor: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the border color of the hover labels for this trace. """,
    )
    font: Optional[FontInsidetextfontTextfontOutsidetextfont1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets the font used in hover labels. """,
    )
    namelength: Optional[
        int
        | constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | List[int]
    ] = Field(
        None,
        description=""" integer or array of integers greater than or equal to -1<br>Sets the default length (in number of characters) of the trace name in the hover labels for all traces. -1 shows the whole name regardless of length. 0-3 shows the first 0-3 characters, and an integer >3 will show the whole name if it is less than that many characters, but if it is longer, will truncate to `namelength - 3` characters and add an ellipsis. """,
    )


class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
    color: Optional[str | List[str]] = Field(
        None, description=""" color or array of colors<br> """
    )
    family: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 1<br> """,
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


class BarLegendgrouptitle(TracePropsAttribute):
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


class BarMarkerColorbarTitle(TracePropsAttribute):
    font: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets this color bar's title font. Note that the title's font used to be set by the now deprecated `titlefont` attribute. """,
    )
    side: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "right" | "top" | "bottom" )<br>Determines the location of color bar's title with respect to the color bar. Defaults to "top" when `orientation` if "v" and defaults to "right" when `orientation` if "h". Note that the title's location used to be set by the now deprecated `titleside` attribute. """,
    )
    text: Optional[str] = Field(
        None,
        description=""" string<br>Sets the title of the color bar. Note that before the existence of `title.text`, the title's contents used to be defined as the `title` attribute itself. This behavior has been deprecated. """,
    )


class BarMarkerColorbar(TracePropsAttribute):
    bgcolor: Optional[str] = Field(
        None, description=""" color<br>Sets the color of padded area. """
    )
    bordercolor: Optional[str] = Field(
        None, description=""" color<br>Sets the axis line color. """
    )
    borderwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) or the border enclosing this color bar. """,
    )
    dtick: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Sets the step in-between ticks on this axis. Use with `tick0`. Must be a positive number, or special strings available to "log" and "date" axes. If the axis `type` is "log", then ticks are set every 10^(n"dtick) where n is the tick number. For example, to set a tick mark at 1, 10, 100, 1000, ... set dtick to 1. To set tick marks at 1, 100, 10000, ... set dtick to 2. To set tick marks at 1, 5, 25, 125, 625, 3125, ... set dtick to log_10(5), or 0.69897000433. "log" has several special values; "L<f>", where `f` is a positive number, gives ticks linearly spaced in value (but not position). For example `tick0` = 0.1, `dtick` = "L0.5" will put ticks at 0.1, 0.6, 1.1, 1.6 etc. To show powers of 10 plus small digits between, use "D1" (all digits) or "D2" (only 2 and 5). `tick0` is ignored for "D1" and "D2". If the axis `type` is "date", then you must convert the time to milliseconds. For example, to set the interval between ticks to one day, set `dtick` to 86400000.0. "date" also has special values "M<n>" gives ticks spaced by a number of months. `n` must be a positive integer. To set ticks on the 15th of every third month, set `tick0` to "2000-01-15" and `dtick` to "M3". To set ticks every 4 years, set `dtick` to "M48" """,
    )
    exponentformat: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "none" | "e" | "e" | "power" | "si" | "b" )<br>Determines a formatting rule for the tick exponents. For example, consider the number 1,000,000,000. If "none", it appears as 1,000,000,000. If "e", 1e+9. If "E", 1E+9. If "power", 1x10^9 (with 9 in a super script). If "SI", 1G. If "B", 1B. """,
    )
    len: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the length of the color bar This measure excludes the padding of both ends. That is, the color bar length is this length minus the padding on both ends. """,
    )
    lenmode: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "fraction" | "pixels" )<br>Determines whether this color bar's length (i.e. the measure in the color variation direction) is set in units of plot "fraction" or in "pixels. Use `len` to set the value. """,
    )
    minexponent: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Hide SI prefix for 10^n if |n| is below this number. This only has an effect when `tickformat` is "SI" or "B". """,
    )
    nticks: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" integer greater than or equal to 0<br>Specifies the maximum number of ticks for the particular axis. The actual number of ticks will be chosen automatically to be less than or equal to `nticks`. Has an effect only if `tickmode` is set to "auto". """,
    )
    orientation: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "h" | "v" )<br>Sets the orientation of the colorbar. """,
    )
    outlinecolor: Optional[str] = Field(
        None, description=""" color<br>Sets the axis line color. """
    )
    outlinewidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the width (in px) of the axis line. """,
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
    thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the thickness of the color bar This measure excludes the size of the padding, ticks and labels. """,
    )
    thicknessmode: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "fraction" | "pixels" )<br>Determines whether this color bar's thickness (i.e. the measure in the constant color direction) is set in units of plot "fraction" or in "pixels". Use `thickness` to set the value. """,
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
    ticklabeloverflow: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "allow" | "hide past div" | "hide past domain" )<br>Determines how we handle tick labels that would overflow either the graph div or the domain of the axis. The default value for inside tick labels is "hide past domain". In other cases the default is "hide past div". """,
    )
    ticklabelposition: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "outside" | "inside" | "outside top" | "inside top" | "outside left" | "inside left" | "outside right" | "inside right" | "outside bottom" | "inside bottom" )<br>Determines where tick labels are drawn relative to the ticks. Left and right options are used when `orientation` is "h", top and bottom when `orientation` is "v". """,
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
    title: Optional[BarMarkerColorbarTitle] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    x: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to -2 and 3<br>Sets the x position of the color bar (in plot fraction). Defaults to 1.02 when `orientation` is "v" and 0.5 when `orientation` is "h". """,
    )
    xanchor: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "left" | "center" | "right" )<br>Sets this color bar's horizontal position anchor. This anchor binds the `x` position to the "left", "center" or "right" of the color bar. Defaults to "left" when `orientation` is "v" and "center" when `orientation` is "h". """,
    )
    xpad: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the amount of padding (in px) along the x direction. """,
    )
    y: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to -2 and 3<br>Sets the y position of the color bar (in plot fraction). Defaults to 0.5 when `orientation` is "v" and 1.02 when `orientation` is "h". """,
    )
    yanchor: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "top" | "middle" | "bottom" )<br>Sets this color bar's vertical position anchor This anchor binds the `y` position to the "top", "middle" or "bottom" of the color bar. Defaults to "middle" when `orientation` is "v" and "bottom" when `orientation` is "h". """,
    )
    ypad: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the amount of padding (in px) along the y direction. """,
    )


class Line1(TracePropsAttribute):
    autocolorscale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether the colorscale is a default palette (`autocolorscale: true`) or the palette determined by `marker.line.colorscale`. Has an effect only if in `marker.line.color` is set to a numerical array. In case `colorscale` is unspecified or `autocolorscale` is true, the default palette will be chosen according to whether numbers in the `color` array are all positive, all negative or mixed. """,
    )
    cauto: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not the color domain is computed with respect to the input data (here in `marker.line.color`) or the bounds set in `marker.line.cmin` and `marker.line.cmax` Has an effect only if in `marker.line.color` is set to a numerical array. Defaults to `false` when `marker.line.cmin` and `marker.line.cmax` are set by the user. """,
    )
    cmax: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the upper bound of the color domain. Has an effect only if in `marker.line.color` is set to a numerical array. Value should have the same units as in `marker.line.color` and if set, `marker.line.cmin` must be set as well. """,
    )
    cmid: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the mid-point of the color domain by scaling `marker.line.cmin` and/or `marker.line.cmax` to be equidistant to this point. Has an effect only if in `marker.line.color` is set to a numerical array. Value should have the same units as in `marker.line.color`. Has no effect when `marker.line.cauto` is `false`. """,
    )
    cmin: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the lower bound of the color domain. Has an effect only if in `marker.line.color` is set to a numerical array. Value should have the same units as in `marker.line.color` and if set, `marker.line.cmax` must be set as well. """,
    )
    color: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the marker.line color. It accepts either a specific color or an array of numbers that are mapped to the colorscale relative to the max and min values of the array or relative to `marker.line.cmin` and `marker.line.cmax` if set. """,
    )
    coloraxis: Optional[str] = Field(
        None,
        description=""" subplotid<br>Sets a reference to a shared color axis. References to these shared color axes are "coloraxis", "coloraxis2", "coloraxis3", etc. Settings for these shared color axes are set in the layout, under `layout.coloraxis`, `layout.coloraxis2`, etc. Note that multiple color scales can be linked to the same color axis. """,
    )
    colorscale: Optional[Any] = Field(
        None,
        description=""" colorscale<br>Sets the colorscale. Has an effect only if in `marker.line.color` is set to a numerical array. The colorscale must be an array containing arrays mapping a normalized value to an rgb, rgba, hex, hsl, hsv, or named color string. At minimum, a mapping for the lowest (0) and highest (1) values are required. For example, `[[0, 'rgb(0,0,255)'], [1, 'rgb(255,0,0)']]`. To control the bounds of the colorscale in color space, use `marker.line.cmin` and `marker.line.cmax`. Alternatively, `colorscale` may be a palette name string of the following list: Blackbody,Bluered,Blues,Cividis,Earth,Electric,Greens,Greys,Hot,Jet,Picnic,Portland,Rainbow,RdBu,Reds,Viridis,YlGnBu,YlOrRd. """,
    )
    reversescale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Reverses the color mapping if true. Has an effect only if in `marker.line.color` is set to a numerical array. If true, `marker.line.cmin` will correspond to the last color in the array and `marker.line.cmax` will correspond to the first color. """,
    )
    width: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 0<br>Sets the width (in px) of the lines bounding the marker points. """,
    )


class PatternFillpattern1(TracePropsAttribute):
    bgcolor: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>When there is no colorscale sets the color of background pattern fill. Defaults to a `marker.color` background when `fillmode` is "overlay". Otherwise, defaults to a transparent background. """,
    )
    fgcolor: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>When there is no colorscale sets the color of foreground pattern fill. Defaults to a `marker.color` background when `fillmode` is "replace". Otherwise, defaults to dark grey or white to increase contrast with the `bgcolor`. """,
    )
    fgopacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to 0 and 1<br>Sets the opacity of the foreground pattern fill. Defaults to a 0.5 when `fillmode` is "overlay". Otherwise, defaults to 1. """,
    )
    fillmode: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "replace" | "overlay" )<br>Determines whether `marker.color` should be used as a default to `bgcolor` or a `fgcolor`. """,
    )
    shape: Optional[str | List[str]] = Field(
        None,
        description=""" enumerated or array of enumerateds , one of ( "" | "/" | "\" | "x" | "-" | "|" | "+" | "." )<br>Sets the shape of the pattern fill. By default, no pattern is used for filling the area. """,
    )
    size: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 0<br>Sets the size of unit squares of the pattern fill in pixels, which corresponds to the interval of repetition of the pattern. """,
    )
    solidity: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers between or equal to 0 and 1<br>Sets the solidity of the pattern fill. Solidity is roughly the fraction of the area filled by the pattern. Solidity of 0 shows only the background color without pattern and solidty of 1 shows only the foreground color without pattern. """,
    )


class BarMarker(TracePropsAttribute):
    autocolorscale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether the colorscale is a default palette (`autocolorscale: true`) or the palette determined by `marker.colorscale`. Has an effect only if in `marker.color` is set to a numerical array. In case `colorscale` is unspecified or `autocolorscale` is true, the default palette will be chosen according to whether numbers in the `color` array are all positive, all negative or mixed. """,
    )
    cauto: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not the color domain is computed with respect to the input data (here in `marker.color`) or the bounds set in `marker.cmin` and `marker.cmax` Has an effect only if in `marker.color` is set to a numerical array. Defaults to `false` when `marker.cmin` and `marker.cmax` are set by the user. """,
    )
    cmax: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the upper bound of the color domain. Has an effect only if in `marker.color` is set to a numerical array. Value should have the same units as in `marker.color` and if set, `marker.cmin` must be set as well. """,
    )
    cmid: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the mid-point of the color domain by scaling `marker.cmin` and/or `marker.cmax` to be equidistant to this point. Has an effect only if in `marker.color` is set to a numerical array. Value should have the same units as in `marker.color`. Has no effect when `marker.cauto` is `false`. """,
    )
    cmin: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the lower bound of the color domain. Has an effect only if in `marker.color` is set to a numerical array. Value should have the same units as in `marker.color` and if set, `marker.cmax` must be set as well. """,
    )
    color: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the marker color. It accepts either a specific color or an array of numbers that are mapped to the colorscale relative to the max and min values of the array or relative to `marker.cmin` and `marker.cmax` if set. """,
    )
    coloraxis: Optional[str] = Field(
        None,
        description=""" subplotid<br>Sets a reference to a shared color axis. References to these shared color axes are "coloraxis", "coloraxis2", "coloraxis3", etc. Settings for these shared color axes are set in the layout, under `layout.coloraxis`, `layout.coloraxis2`, etc. Note that multiple color scales can be linked to the same color axis. """,
    )
    colorbar: Optional[BarMarkerColorbar] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    colorscale: Optional[Any] = Field(
        None,
        description=""" colorscale<br>Sets the colorscale. Has an effect only if in `marker.color` is set to a numerical array. The colorscale must be an array containing arrays mapping a normalized value to an rgb, rgba, hex, hsl, hsv, or named color string. At minimum, a mapping for the lowest (0) and highest (1) values are required. For example, `[[0, 'rgb(0,0,255)'], [1, 'rgb(255,0,0)']]`. To control the bounds of the colorscale in color space, use `marker.cmin` and `marker.cmax`. Alternatively, `colorscale` may be a palette name string of the following list: Blackbody,Bluered,Blues,Cividis,Earth,Electric,Greens,Greys,Hot,Jet,Picnic,Portland,Rainbow,RdBu,Reds,Viridis,YlGnBu,YlOrRd. """,
    )
    cornerradius: Optional[float | constr(pattern= r"^\d+%$") | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
        None,
        description=""" number or categorical coordinate string<br>Sets the rounding of bar corners. May be an integer number of pixels, or a percentage of bar width (as a string ending in %)"""
    )
    line: Optional[Line1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    opacity: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers between or equal to 0 and 1<br>Sets the opacity of the bars. """,
    )
    pattern: Optional[PatternFillpattern1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets the pattern within the marker. """,
    )
    reversescale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Reverses the color mapping if true. Has an effect only if in `marker.color` is set to a numerical array. If true, `marker.cmin` will correspond to the last color in the array and `marker.cmax` will correspond to the first color. """,
    )
    showscale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not a colorbar is displayed for this trace. Has an effect only if in `marker.color` is set to a numerical array. """,
    )


class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
    color: Optional[str | List[str]] = Field(
        None, description=""" color or array of colors<br> """
    )
    family: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 1<br> """,
    )


class Marker3(TracePropsAttribute):
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the marker color of selected points. """
    )
    opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to 0 and 1<br>Sets the marker opacity of selected points. """,
    )


class Textfont2(TracePropsAttribute):
    color: Optional[str] = Field(
        None, description=""" color<br>Sets the text font color of selected points. """
    )


class BarSelected(TracePropsAttribute):
    marker: Optional[Marker3] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    textfont: Optional[Textfont2] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )


class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
    color: Optional[str | List[str]] = Field(
        None, description=""" color or array of colors<br> """
    )
    family: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """,
    )
    size: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 1<br> """,
    )


class Marker4(TracePropsAttribute):
    color: Optional[str] = Field(
        None,
        description=""" color<br>Sets the marker color of unselected points, applied only when a selection exists. """,
    )
    opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to 0 and 1<br>Sets the marker opacity of unselected points, applied only when a selection exists. """,
    )


class Textfont1(TracePropsAttribute):
    color: Optional[str] = Field(
        None,
        description=""" color<br>Sets the text font color of unselected points, applied only when a selection exists. """,
    )


class BarUnselected(TracePropsAttribute):
    marker: Optional[Marker4] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    textfont: Optional[Textfont1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )


class Bar(TraceProps):
    alignmentgroup: Optional[str] = Field(
        None,
        description=""" string<br>Set several traces linked to the same position axis or matching axes to the same alignmentgroup. This controls whether bars compute their positional range dependently or independently. """,
    )
    base: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" number or categorical coordinate string<br>Sets where the bar base is drawn (in position axis units). In "stack" or "relative" barmode, traces that set "base" will be excluded and drawn in "overlay" mode instead. """,
    )
    cliponaxis: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether the text nodes are clipped about the subplot axes. To show the text nodes above axis lines and tick labels, make sure to set `xaxis.layer` and `yaxis.layer` to "below traces". """,
    )
    constraintext: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "inside" | "outside" | "both" | "none" )<br>Constrain the size of text inside or outside a bar to be no larger than the bar itself. """,
    )
    customdata: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Assigns extra data each datum. This may be useful when listening to hover, click and selection events. Note that, "scatter" traces also appends customdata items in the markers DOM elements """,
    )
    dx: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the x coordinate step. See `x0` for more info. """,
    )
    dy: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number<br>Sets the y coordinate step. See `y0` for more info. """,
    )
    error_x: Optional[BarError_x] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    error_y: Optional[BarError_y] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    hoverinfo: Optional[str] = Field(
        None,
        description=""" flaglist string. any combination of "x", "y", "z", "text", "name" joined with a "+" or "all" or "none" or "skip".<br>Determines which trace information appear on hover. If `none` or `skip` are set, no information is displayed upon hovering. But, if `none` is set, click and hover events are still fired. """,
    )
    hoverlabel: Optional[BarHoverlabel] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    hovertemplate: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>Template string used for rendering the information that appear on hover box. Note that this will override `hoverinfo`. Variables are inserted using %{variable}, for example "y: %{y}" as well as %{xother}, {%_xother}, {%_xother_}, {%xother_}. When showing info for several points, "xother" will be added to those with different x positions from the first point. An underscore before or after "(x|y)other" will add a space on that side, only when this field is shown. Numbers are formatted using d3-format's syntax %{variable:d3-format}, for example "Price: %{y:$.2f}". https://github.com/d3/d3-format/tree/v1.4.5#d3-format for details on the formatting syntax. Dates are formatted using d3-time-format's syntax %{variable|d3-time-format}, for example "Day: %{2019-01-01|%A}". https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format for details on the date formatting syntax. The variables available in `hovertemplate` are the ones emitted as event data described at this link https://plotly.com/javascript/plotlyjs-events/#event-data. Additionally, every attributes that can be specified per-point (the ones that are `arrayOk: true`) are available. variables `value` and `label`. Anything contained in tag `<extra>` is displayed in the secondary box, for example "<extra>{fullData.name}</extra>". To hide the secondary box completely, use an empty tag `<extra></extra>`. """,
    )
    hovertext: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>Sets hover text elements associated with each (x,y) pair. If a single string, the same string appears over all the data points. If an array of string, the items are mapped in order to the this trace's (x,y) coordinates. To be seen, trace `hoverinfo` must contain a "text" flag. """,
    )
    ids: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Assigns id labels to each datum. These ids for object constancy of data points during animation. Should be an array of strings, not numbers or any other type. """,
    )
    insidetextanchor: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "end" | "middle" | "start" )<br>Determines if texts are kept at center or start/end points in `textposition` "inside" mode. """,
    )
    insidetextfont: Optional[FontInsidetextfontTextfontOutsidetextfont1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets the font used for `text` lying inside the bar. """,
    )
    legendgroup: Optional[str] = Field(
        None,
        description=""" string<br>Sets the legend group for this trace. Traces part of the same legend group hide/show at the same time when toggling legend items. """,
    )
    legendgrouptitle: Optional[BarLegendgrouptitle] = Field(
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
    marker: Optional[BarMarker] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    meta: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Assigns extra meta information associated with this trace that can be used in various text attributes. Attributes such as trace `name`, graph, axis and colorbar `title.text`, annotation `text` `rangeselector`, `updatemenues` and `sliders` `label` text all support `meta`. To access the trace `meta` values in an attribute in the same trace, simply use `%{meta[i]}` where `i` is the index or key of the `meta` item in question. To access trace `meta` in layout attributes, use `%{data[n[.meta[i]}` where `i` is the index or key of the `meta` and `n` is the trace index. """,
    )
    offset: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers<br>Shifts the position where the bar is drawn (in position axis units). In "group" barmode, traces that set "offset" will be excluded and drawn in "overlay" mode instead. """,
    )
    offsetgroup: Optional[str] = Field(
        None,
        description=""" string<br>Set several traces linked to the same position axis or matching axes to the same offsetgroup where bars of the same position coordinate will line up. """,
    )
    opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number between or equal to 0 and 1<br>Sets the opacity of the trace. """,
    )
    orientation: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "v" | "h" )<br>Sets the orientation of the bars. With "v" ("h"), the value of the each bar spans along the vertical (horizontal). """,
    )
    outsidetextfont: Optional[FontInsidetextfontTextfontOutsidetextfont1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets the font used for `text` lying outside the bar. """,
    )
    selected: Optional[BarSelected] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    selectedpoints: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Array containing integer indices of selected points. Has an effect only for traces that support selections. Note that an empty array means an empty selection where the `unselected` are turned on for all points, whereas, any other non-array values means no selection all where the `selected` and `unselected` styles have no effect. """,
    )
    showlegend: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" boolean<br>Determines whether or not an item corresponding to this trace is shown in the legend. """,
    )
    text: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>Sets text elements associated with each (x,y) pair. If a single string, the same string appears over all the data points. If an array of string, the items are mapped in order to the this trace's (x,y) coordinates. If trace `hoverinfo` contains a "text" flag and "hovertext" is not set, these elements will be seen in the hover labels. """,
    )
    textangle: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" angle<br>Sets the angle of the tick labels with respect to the bar. For example, a `tickangle` of -90 draws the tick labels vertically. With "auto" the texts may automatically be rotated to fit with the maximum size in bars. """,
    )
    textfont: Optional[FontInsidetextfontTextfontOutsidetextfont1] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets the font used for `text`. """,
    )
    textposition: Optional[str | List[str]] = Field(
        None,
        description=""" enumerated or array of enumerateds , one of ( "inside" | "outside" | "auto" | "none" )<br>Specifies the location of the `text`. "inside" positions `text` inside, next to the bar end (rotated and scaled if needed). "outside" positions `text` outside, next to the bar end (scaled if needed), unless there is another bar stacked on this one, then the text gets pushed inside. "auto" tries to position `text` inside the bar, but if the bar is too small and no bar is stacked on this one the text is moved outside. If "none", no text appears. """,
    )
    texttemplate: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>Template string used for rendering the information text that appear on points. Note that this will override `textinfo`. Variables are inserted using %{variable}, for example "y: %{y}". Numbers are formatted using d3-format's syntax %{variable:d3-format}, for example "Price: %{y:$.2f}". https://github.com/d3/d3-format/tree/v1.4.5#d3-format for details on the formatting syntax. Dates are formatted using d3-time-format's syntax %{variable|d3-time-format}, for example "Day: %{2019-01-01|%A}". https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format for details on the date formatting syntax. Every attributes that can be specified per-point (the ones that are `arrayOk: true`) are available. variables `value` and `label`. """,
    )
    type: Literal["bar"]
    uirevision: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Controls persistence of some user-driven changes to the trace: `constraintrange` in `parcoords` traces, as well as some `editable: true` modifications such as `name` and `colorbar.title`. Defaults to `layout.uirevision`. Note that other user-driven trace attribute changes are controlled by `layout` attributes: `trace.visible` is controlled by `layout.legend.uirevision`, `selectedpoints` is controlled by `layout.selectionrevision`, and `colorbar.(x|y)` (accessible with `config: {editable: true}`) is controlled by `layout.editrevision`. Trace changes are tracked by `uid`, which only falls back on trace index if no `uid` is provided. So if your app can add/remove traces before the end of the `data` array, such that the same trace has a different index, you can still preserve user-driven changes if you give each trace a `uid` that stays with it as it moves. """,
    )
    unselected: Optional[BarUnselected] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    visible: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( true | false | "legendonly" )<br>Determines whether or not this trace is visible. If "legendonly", the trace is not drawn, but can appear as a legend item (provided that the legend itself is visible). """,
    )
    width: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 0<br>Sets the bar width (in position axis units). """,
    )
    x0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Alternate to `x`. Builds a linear space of x coordinates. Use with `dx` where `x0` is the starting coordinate and `dx` the step. """,
    )
    x: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" data array<br>Sets the x coordinates. """
    )
    xaxis: Optional[str] = Field(
        None,
        description=""" subplotid<br>Sets a reference between this trace's x coordinates and a 2D cartesian x axis. If "x" (the default value), the x coordinates refer to `layout.xaxis`. If "x2", the x coordinates refer to `layout.xaxis2`, and so on. """,
    )
    xcalendar: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "chinese" | "coptic" | "discworld" | "ethiopian" | "gregorian" | "hebrew" | "islamic" | "jalali" | "julian" | "mayan" | "nanakshahi" | "nepali" | "persian" | "taiwan" | "thai" | "ummalqura" )<br>Sets the calendar system to use with `x` date data. """,
    )
    xhoverformat: Optional[str] = Field(
        None,
        description=""" string<br>Sets the hover text formatting rulefor `x` using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. And for dates see: https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format. We add two items to d3's date formatter: "%h" for half of the year as a decimal number as well as "%{n}f" for fractional seconds with n digits. For example, "2016-10-13 09:15:23.456" with tickformat "%H~%M~%S.%2f" would display "09~15~23.46"By default the values are formatted using `xaxis.hoverformat`. """,
    )
    xperiod0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the base for period positioning in milliseconds or date string on the x0 axis. When `x0period` is round number of weeks, the `x0period0` by default would be on a Sunday i.e. 2000-01-02, otherwise it would be at 2000-01-01. """,
    )
    xperiod: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the period positioning in milliseconds or "M<n>" on the x axis. Special values in the form of "M<n>" could be used to declare the number of months. In this case `n` must be a positive integer. """,
    )
    xperiodalignment: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "start" | "middle" | "end" )<br>Only relevant when the axis `type` is "date". Sets the alignment of data points on the x axis. """,
    )
    y0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Alternate to `y`. Builds a linear space of y coordinates. Use with `dy` where `y0` is the starting coordinate and `dy` the step. """,
    )
    y: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" data array<br>Sets the y coordinates. """
    )
    yaxis: Optional[str] = Field(
        None,
        description=""" subplotid<br>Sets a reference between this trace's y coordinates and a 2D cartesian y axis. If "y" (the default value), the y coordinates refer to `layout.yaxis`. If "y2", the y coordinates refer to `layout.yaxis2`, and so on. """,
    )
    ycalendar: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "chinese" | "coptic" | "discworld" | "ethiopian" | "gregorian" | "hebrew" | "islamic" | "jalali" | "julian" | "mayan" | "nanakshahi" | "nepali" | "persian" | "taiwan" | "thai" | "ummalqura" )<br>Sets the calendar system to use with `y` date data. """,
    )
    yhoverformat: Optional[str] = Field(
        None,
        description=""" string<br>Sets the hover text formatting rulefor `y` using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. And for dates see: https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format. We add two items to d3's date formatter: "%h" for half of the year as a decimal number as well as "%{n}f" for fractional seconds with n digits. For example, "2016-10-13 09:15:23.456" with tickformat "%H~%M~%S.%2f" would display "09~15~23.46"By default the values are formatted using `yaxis.hoverformat`. """,
    )
    yperiod0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the base for period positioning in milliseconds or date string on the y0 axis. When `y0period` is round number of weeks, the `y0period0` by default would be on a Sunday i.e. 2000-01-02, otherwise it would be at 2000-01-01. """,
    )
    yperiod: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the period positioning in milliseconds or "M<n>" on the y axis. Special values in the form of "M<n>" could be used to declare the number of months. In this case `n` must be a positive integer. """,
    )
    yperiodalignment: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "start" | "middle" | "end" )<br>Only relevant when the axis `type` is "date". Sets the alignment of data points on the y axis. """,
    )
