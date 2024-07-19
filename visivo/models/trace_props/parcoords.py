
from pydantic import Field, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.trace_props.trace_props import  TraceProps, TracePropsAttribute
from typing import List, Literal, Optional 


class Dimensions2(TracePropsAttribute):
	constraintrange: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" array<br>The domain range to which the filter on the dimension is constrained. Must be an array of `[fromValue, toValue]` with `fromValue <= toValue`, or if `multiselect` is not disabled, you may give an array of arrays, where each inner array is `[fromValue, toValue]`. """
	)
	label: Optional[str]= Field(
		None,
		description=""" string<br>The shown name of the dimension. """
	)
	multiselect: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Do we allow multiple selection ranges or just a single range? """
	)
	name: Optional[str]= Field(
		None,
		description=""" string<br>When used in a template, named items are created in the output figure in addition to any items the figure already has in this array. You can modify these items in the output figure by making your own item with `templateitemname` matching this `name` alongside your modifications (including `visible: false` or `enabled: false` to hide it). Has no effect outside of a template. """
	)
	range: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" array<br>The domain range that represents the full, shown axis extent. Defaults to the `values` extent. Must be an array of `[fromValue, toValue]` with finite numbers as elements. """
	)
	templateitemname: Optional[str]= Field(
		None,
		description=""" string<br>Used to refer to a named item in this array in the template. Named items from the template will be created even without a matching item in the input figure, but you can modify one by making an item with `templateitemname` matching its `name`, alongside your modifications (including `visible: false` or `enabled: false` to hide it). If there is no template or no matching item, this item will be hidden unless you explicitly show it with `visible: true`. """
	)
	tickformat: Optional[str]= Field(
		None,
		description=""" string<br>Sets the tick label formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. And for dates see: https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format. We add two items to d3's date formatter: "%h" for half of the year as a decimal number as well as "%{n}f" for fractional seconds with n digits. For example, "2016-10-13 09:15:23.456" with tickformat "%H~%M~%S.%2f" would display "09~15~23.46" """
	)
	ticktext: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the text displayed at the ticks position via `tickvals`. """
	)
	tickvals: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the values at which ticks on this axis appear. """
	)
	values: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Dimension values. `values[n]` represents the value of the `n`th point in the dataset, therefore the `values` vector for all dimensions must be the same (longer vectors will be truncated). Each value must be a finite number. """
	)
	visible: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Shows the dimension when set to `true` (the default). Hides the dimension for `false`. """
	)
class Domain1(TracePropsAttribute):
	column: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this column in the grid for this parcoords trace . """
	)
	row: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this row in the grid for this parcoords trace . """
	)
	x: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" array<br>Sets the horizontal domain of this parcoords trace (in plot fraction). """
	)
	y: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" array<br>Sets the vertical domain of this parcoords trace (in plot fraction). """
	)
class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br> """
	)
	family: Optional[str]= Field(
		None,
		description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 1<br> """
	)
class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br> """
	)
	family: Optional[str]= Field(
		None,
		description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 1<br> """
	)
class ParcoordsLegendgrouptitle(TracePropsAttribute):
	font: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets this legend group's title font. """
	)
	text: Optional[str]= Field(
		None,
		description=""" string<br>Sets the title of the legend group. """
	)
class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br> """
	)
	family: Optional[str]= Field(
		None,
		description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 1<br> """
	)
class Tickformatstops1(TracePropsAttribute):
	dtickrange: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" array<br>range ["min", "max"], where "min", "max" - dtick values which describe some zoom level, it is possible to omit "min" or "max" value by passing "null" """
	)
	enabled: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether or not this stop is used. If `false`, this stop is ignored even within its `dtickrange`. """
	)
	name: Optional[str]= Field(
		None,
		description=""" string<br>When used in a template, named items are created in the output figure in addition to any items the figure already has in this array. You can modify these items in the output figure by making your own item with `templateitemname` matching this `name` alongside your modifications (including `visible: false` or `enabled: false` to hide it). Has no effect outside of a template. """
	)
	templateitemname: Optional[str]= Field(
		None,
		description=""" string<br>Used to refer to a named item in this array in the template. Named items from the template will be created even without a matching item in the input figure, but you can modify one by making an item with `templateitemname` matching its `name`, alongside your modifications (including `visible: false` or `enabled: false` to hide it). If there is no template or no matching item, this item will be hidden unless you explicitly show it with `visible: true`. """
	)
	value: Optional[str]= Field(
		None,
		description=""" string<br>string - dtickformat for described zoom level, the same as "tickformat" """
	)
class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br> """
	)
	family: Optional[str]= Field(
		None,
		description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 1<br> """
	)
class ParcoordsLineColorbarTitle(TracePropsAttribute):
	font: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets this color bar's title font. Note that the title's font used to be set by the now deprecated `titlefont` attribute. """
	)
	side: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "right" | "top" | "bottom" )<br>Determines the location of color bar's title with respect to the color bar. Defaults to "top" when `orientation` if "v" and defaults to "right" when `orientation` if "h". Note that the title's location used to be set by the now deprecated `titleside` attribute. """
	)
	text: Optional[str]= Field(
		None,
		description=""" string<br>Sets the title of the color bar. Note that before the existence of `title.text`, the title's contents used to be defined as the `title` attribute itself. This behavior has been deprecated. """
	)
class ParcoordsLineColorbar(TracePropsAttribute):
	bgcolor: Optional[str]= Field(
		None,
		description=""" color<br>Sets the color of padded area. """
	)
	bordercolor: Optional[str]= Field(
		None,
		description=""" color<br>Sets the axis line color. """
	)
	borderwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the width (in px) or the border enclosing this color bar. """
	)
	dtick: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Sets the step in-between ticks on this axis. Use with `tick0`. Must be a positive number, or special strings available to "log" and "date" axes. If the axis `type` is "log", then ticks are set every 10^(n"dtick) where n is the tick number. For example, to set a tick mark at 1, 10, 100, 1000, ... set dtick to 1. To set tick marks at 1, 100, 10000, ... set dtick to 2. To set tick marks at 1, 5, 25, 125, 625, 3125, ... set dtick to log_10(5), or 0.69897000433. "log" has several special values; "L<f>", where `f` is a positive number, gives ticks linearly spaced in value (but not position). For example `tick0` = 0.1, `dtick` = "L0.5" will put ticks at 0.1, 0.6, 1.1, 1.6 etc. To show powers of 10 plus small digits between, use "D1" (all digits) or "D2" (only 2 and 5). `tick0` is ignored for "D1" and "D2". If the axis `type` is "date", then you must convert the time to milliseconds. For example, to set the interval between ticks to one day, set `dtick` to 86400000.0. "date" also has special values "M<n>" gives ticks spaced by a number of months. `n` must be a positive integer. To set ticks on the 15th of every third month, set `tick0` to "2000-01-15" and `dtick` to "M3". To set ticks every 4 years, set `dtick` to "M48" """
	)
	exponentformat: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "none" | "e" | "e" | "power" | "si" | "b" )<br>Determines a formatting rule for the tick exponents. For example, consider the number 1,000,000,000. If "none", it appears as 1,000,000,000. If "e", 1e+9. If "E", 1E+9. If "power", 1x10^9 (with 9 in a super script). If "SI", 1G. If "B", 1B. """
	)
	len: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the length of the color bar This measure excludes the padding of both ends. That is, the color bar length is this length minus the padding on both ends. """
	)
	lenmode: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "fraction" | "pixels" )<br>Determines whether this color bar's length (i.e. the measure in the color variation direction) is set in units of plot "fraction" or in "pixels. Use `len` to set the value. """
	)
	minexponent: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Hide SI prefix for 10^n if |n| is below this number. This only has an effect when `tickformat` is "SI" or "B". """
	)
	nticks: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" integer greater than or equal to 0<br>Specifies the maximum number of ticks for the particular axis. The actual number of ticks will be chosen automatically to be less than or equal to `nticks`. Has an effect only if `tickmode` is set to "auto". """
	)
	orientation: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "h" | "v" )<br>Sets the orientation of the colorbar. """
	)
	outlinecolor: Optional[str]= Field(
		None,
		description=""" color<br>Sets the axis line color. """
	)
	outlinewidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the width (in px) of the axis line. """
	)
	separatethousands: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>If "true", even 4-digit integers are separated """
	)
	showexponent: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "all" | "first" | "last" | "none" )<br>If "all", all exponents are shown besides their significands. If "first", only the exponent of the first tick is shown. If "last", only the exponent of the last tick is shown. If "none", no exponents appear. """
	)
	showticklabels: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether or not the tick labels are drawn. """
	)
	showtickprefix: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "all" | "first" | "last" | "none" )<br>If "all", all tick labels are displayed with a prefix. If "first", only the first tick is displayed with a prefix. If "last", only the last tick is displayed with a suffix. If "none", tick prefixes are hidden. """
	)
	showticksuffix: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "all" | "first" | "last" | "none" )<br>Same as `showtickprefix` but for tick suffixes. """
	)
	thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the thickness of the color bar This measure excludes the size of the padding, ticks and labels. """
	)
	thicknessmode: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "fraction" | "pixels" )<br>Determines whether this color bar's thickness (i.e. the measure in the constant color direction) is set in units of plot "fraction" or in "pixels". Use `thickness` to set the value. """
	)
	tick0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Sets the placement of the first tick on this axis. Use with `dtick`. If the axis `type` is "log", then you must take the log of your starting tick (e.g. to set the starting tick to 100, set the `tick0` to 2) except when `dtick`="L<f>" (see `dtick` for more info). If the axis `type` is "date", it should be a date string, like date data. If the axis `type` is "category", it should be a number, using the scale where each category is assigned a serial number from zero in the order it appears. """
	)
	tickangle: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" angle<br>Sets the angle of the tick labels with respect to the horizontal. For example, a `tickangle` of -90 draws the tick labels vertically. """
	)
	tickcolor: Optional[str]= Field(
		None,
		description=""" color<br>Sets the tick color. """
	)
	tickfont: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the color bar's tick label font """
	)
	tickformat: Optional[str]= Field(
		None,
		description=""" string<br>Sets the tick label formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. And for dates see: https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format. We add two items to d3's date formatter: "%h" for half of the year as a decimal number as well as "%{n}f" for fractional seconds with n digits. For example, "2016-10-13 09:15:23.456" with tickformat "%H~%M~%S.%2f" would display "09~15~23.46" """
	)
	tickformatstops: Optional[List[Tickformatstops1]]= Field(
		None,
		description=""" array of object where each object has one or more of the keys listed below.<br> """
	)
	ticklabeloverflow: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "allow" | "hide past div" | "hide past domain" )<br>Determines how we handle tick labels that would overflow either the graph div or the domain of the axis. The default value for inside tick labels is "hide past domain". In other cases the default is "hide past div". """
	)
	ticklabelposition: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "outside" | "inside" | "outside top" | "inside top" | "outside left" | "inside left" | "outside right" | "inside right" | "outside bottom" | "inside bottom" )<br>Determines where tick labels are drawn relative to the ticks. Left and right options are used when `orientation` is "h", top and bottom when `orientation` is "v". """
	)
	ticklabelstep: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" integer greater than or equal to 1<br>Sets the spacing between tick labels as compared to the spacing between ticks. A value of 1 (default) means each tick gets a label. A value of 2 means shows every 2nd label. A larger value n means only every nth tick is labeled. `tick0` determines which labels are shown. Not implemented for axes with `type` "log" or "multicategory", or when `tickmode` is "array". """
	)
	ticklen: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the tick length (in px). """
	)
	tickmode: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "auto" | "linear" | "array" )<br>Sets the tick mode for this axis. If "auto", the number of ticks is set via `nticks`. If "linear", the placement of the ticks is determined by a starting position `tick0` and a tick step `dtick` ("linear" is the default value if `tick0` and `dtick` are provided). If "array", the placement of the ticks is set via `tickvals` and the tick text is `ticktext`. ("array" is the default value if `tickvals` is provided). """
	)
	tickprefix: Optional[str]= Field(
		None,
		description=""" string<br>Sets a tick label prefix. """
	)
	ticks: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "outside" | "inside" | "" )<br>Determines whether ticks are drawn or not. If "", this axis' ticks are not drawn. If "outside" ("inside"), this axis' are drawn outside (inside) the axis lines. """
	)
	ticksuffix: Optional[str]= Field(
		None,
		description=""" string<br>Sets a tick label suffix. """
	)
	ticktext: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the text displayed at the ticks position via `tickvals`. Only has an effect if `tickmode` is set to "array". Used with `tickvals`. """
	)
	tickvals: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the values at which ticks on this axis appear. Only has an effect if `tickmode` is set to "array". Used with `ticktext`. """
	)
	tickwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the tick width (in px). """
	)
	title: Optional[ParcoordsLineColorbarTitle]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	x: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to -2 and 3<br>Sets the x position of the color bar (in plot fraction). Defaults to 1.02 when `orientation` is "v" and 0.5 when `orientation` is "h". """
	)
	xanchor: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "left" | "center" | "right" )<br>Sets this color bar's horizontal position anchor. This anchor binds the `x` position to the "left", "center" or "right" of the color bar. Defaults to "left" when `orientation` is "v" and "center" when `orientation` is "h". """
	)
	xpad: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the amount of padding (in px) along the x direction. """
	)
	y: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to -2 and 3<br>Sets the y position of the color bar (in plot fraction). Defaults to 0.5 when `orientation` is "v" and 1.02 when `orientation` is "h". """
	)
	yanchor: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "top" | "middle" | "bottom" )<br>Sets this color bar's vertical position anchor This anchor binds the `y` position to the "top", "middle" or "bottom" of the color bar. Defaults to "middle" when `orientation` is "v" and "bottom" when `orientation` is "h". """
	)
	ypad: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the amount of padding (in px) along the y direction. """
	)
class ParcoordsLine(TracePropsAttribute):
	autocolorscale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether the colorscale is a default palette (`autocolorscale: true`) or the palette determined by `line.colorscale`. Has an effect only if in `line.color` is set to a numerical array. In case `colorscale` is unspecified or `autocolorscale` is true, the default palette will be chosen according to whether numbers in the `color` array are all positive, all negative or mixed. """
	)
	cauto: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether or not the color domain is computed with respect to the input data (here in `line.color`) or the bounds set in `line.cmin` and `line.cmax` Has an effect only if in `line.color` is set to a numerical array. Defaults to `false` when `line.cmin` and `line.cmax` are set by the user. """
	)
	cmax: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the upper bound of the color domain. Has an effect only if in `line.color` is set to a numerical array. Value should have the same units as in `line.color` and if set, `line.cmin` must be set as well. """
	)
	cmid: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the mid-point of the color domain by scaling `line.cmin` and/or `line.cmax` to be equidistant to this point. Has an effect only if in `line.color` is set to a numerical array. Value should have the same units as in `line.color`. Has no effect when `line.cauto` is `false`. """
	)
	cmin: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the lower bound of the color domain. Has an effect only if in `line.color` is set to a numerical array. Value should have the same units as in `line.color` and if set, `line.cmax` must be set as well. """
	)
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br>Sets the line color. It accepts either a specific color or an array of numbers that are mapped to the colorscale relative to the max and min values of the array or relative to `line.cmin` and `line.cmax` if set. """
	)
	coloraxis: Optional[str]= Field(
		None,
		description=""" subplotid<br>Sets a reference to a shared color axis. References to these shared color axes are "coloraxis", "coloraxis2", "coloraxis3", etc. Settings for these shared color axes are set in the layout, under `layout.coloraxis`, `layout.coloraxis2`, etc. Note that multiple color scales can be linked to the same color axis. """
	)
	colorbar: Optional[ParcoordsLineColorbar]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	colorscale: Optional[str]= Field(
		None,
		description=""" colorscale<br>Sets the colorscale. Has an effect only if in `line.color` is set to a numerical array. The colorscale must be an array containing arrays mapping a normalized value to an rgb, rgba, hex, hsl, hsv, or named color string. At minimum, a mapping for the lowest (0) and highest (1) values are required. For example, `[[0, 'rgb(0,0,255)'], [1, 'rgb(255,0,0)']]`. To control the bounds of the colorscale in color space, use `line.cmin` and `line.cmax`. Alternatively, `colorscale` may be a palette name string of the following list: Blackbody,Bluered,Blues,Cividis,Earth,Electric,Greens,Greys,Hot,Jet,Picnic,Portland,Rainbow,RdBu,Reds,Viridis,YlGnBu,YlOrRd. """
	)
	reversescale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Reverses the color mapping if true. Has an effect only if in `line.color` is set to a numerical array. If true, `line.cmin` will correspond to the last color in the array and `line.cmax` will correspond to the first color. """
	)
	showscale: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether or not a colorbar is displayed for this trace. Has an effect only if in `line.color` is set to a numerical array. """
	)
class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br> """
	)
	family: Optional[str]= Field(
		None,
		description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 1<br> """
	)
class TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br> """
	)
	family: Optional[str]= Field(
		None,
		description=""" string<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 1<br> """
	)
class Line18(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the base color of unselected lines. in connection with `unselected.line.opacity`. """
	)
	opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 1<br>Sets the opacity of unselected lines. The default "auto" decreases the opacity smoothly as the number of lines increases. Use "1" to achieve exact `unselected.line.color`. """
	)
class ParcoordsUnselected(TracePropsAttribute):
	line: Optional[Line18]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class Parcoords(TraceProps):
	customdata: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns extra data each datum. This may be useful when listening to hover, click and selection events. Note that, "scatter" traces also appends customdata items in the markers DOM elements """
	)
	dimensions: Optional[List[Dimensions2]]= Field(
		None,
		description=""" array of object where each object has one or more of the keys listed below.<br> """
	)
	domain: Optional[Domain1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	ids: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns id labels to each datum. These ids for object constancy of data points during animation. Should be an array of strings, not numbers or any other type. """
	)
	labelangle: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" angle<br>Sets the angle of the labels with respect to the horizontal. For example, a `tickangle` of -90 draws the labels vertically. Tilted labels with "labelangle" may be positioned better inside margins when `labelposition` is set to "bottom". """
	)
	labelfont: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the font for the `dimension` labels. """
	)
	labelside: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "top" | "bottom" )<br>Specifies the location of the `label`. "top" positions labels above, next to the title "bottom" positions labels below the graph Tilted labels with "labelangle" may be positioned better inside margins when `labelposition` is set to "bottom". """
	)
	legendgrouptitle: Optional[ParcoordsLegendgrouptitle]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	legendrank: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the legend rank for this trace. Items and groups with smaller ranks are presented on top/left side while with `"reversed" `legend.traceorder` they are on bottom/right side. The default legendrank is 1000, so that you can use ranks less than 1000 to place certain items before all unranked items, and ranks greater than 1000 to go after all unranked items. """
	)
	legendwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the width (in px or fraction) of the legend for this trace. """
	)
	line: Optional[ParcoordsLine]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	meta: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Assigns extra meta information associated with this trace that can be used in various text attributes. Attributes such as trace `name`, graph, axis and colorbar `title.text`, annotation `text` `rangeselector`, `updatemenues` and `sliders` `label` text all support `meta`. To access the trace `meta` values in an attribute in the same trace, simply use `%{meta[i]}` where `i` is the index or key of the `meta` item in question. To access trace `meta` in layout attributes, use `%{data[n[.meta[i]}` where `i` is the index or key of the `meta` and `n` is the trace index. """
	)
	rangefont: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the font for the `dimension` range values. """
	)
	tickfont: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the font for the `dimension` tick values. """
	)
	type: Literal["parcoords"]= Field(
		...,
		description=""" "parcoords"<br> """
	)
	uirevision: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Controls persistence of some user-driven changes to the trace: `constraintrange` in `parcoords` traces, as well as some `editable: true` modifications such as `name` and `colorbar.title`. Defaults to `layout.uirevision`. Note that other user-driven trace attribute changes are controlled by `layout` attributes: `trace.visible` is controlled by `layout.legend.uirevision`, `selectedpoints` is controlled by `layout.selectionrevision`, and `colorbar.(x|y)` (accessible with `config: {editable: true}`) is controlled by `layout.editrevision`. Trace changes are tracked by `uid`, which only falls back on trace index if no `uid` is provided. So if your app can add/remove traces before the end of the `data` array, such that the same trace has a different index, you can still preserve user-driven changes if you give each trace a `uid` that stays with it as it moves. """
	)
	unselected: Optional[ParcoordsUnselected]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	visible: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( true | false | "legendonly" )<br>Determines whether or not this trace is visible. If "legendonly", the trace is not drawn, but can appear as a legend item (provided that the legend itself is visible). """
	)