
from pydantic import Field, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.trace_props.trace_props import  TraceProps, TracePropsAttribute
from typing import List, Literal, Optional, Any 


class Line2(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the line color. """
	)
	dash: Optional[str]= Field(
		None,
		description=""" string<br>Sets the dash style of lines. Set to a dash type string ("solid", "dot", "dash", "longdash", "dashdot", or "longdashdot") or a dash length list in px (eg "5px,10px,2px,2px"). """
	)
	width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the line width (in px). """
	)
class WaterfallConnector(TracePropsAttribute):
	line: Optional[Line2]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	mode: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "spanning" | "between" )<br>Sets the shape of connector lines. """
	)
	visible: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines if connector lines are drawn.  """
	)
class Line24(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the line color of all decreasing values. """
	)
	width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the line width of all decreasing values. """
	)
class WaterfallDecreasingMarker(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the marker color of all decreasing values. """
	)
	line: Optional[Line24]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class WaterfallDecreasing(TracePropsAttribute):
	marker: Optional[WaterfallDecreasingMarker]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br> """
	)
	family: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers greater than or equal to 1<br> """
	)
class WaterfallHoverlabel(TracePropsAttribute):
	align: Optional[str | List[str] ]= Field(
		None,
		description=""" enumerated or array of enumerateds , one of ( "left" | "right" | "auto" )<br>Sets the horizontal alignment of the text content within hover label box. Has an effect only if the hover label text spans more two or more lines """
	)
	bgcolor: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br>Sets the background color of the hover labels for this trace """
	)
	bordercolor: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br>Sets the border color of the hover labels for this trace. """
	)
	font: Optional[FontInsidetextfontTextfontOutsidetextfont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the font used in hover labels. """
	)
	namelength: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | List[int]]= Field(
		None,
		description=""" integer or array of integers greater than or equal to -1<br>Sets the default length (in number of characters) of the trace name in the hover labels for all traces. -1 shows the whole name regardless of length. 0-3 shows the first 0-3 characters, and an integer >3 will show the whole name if it is less than that many characters, but if it is longer, will truncate to `namelength - 3` characters and add an ellipsis. """
	)
class Line27(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the line color of all increasing values. """
	)
	width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the line width of all increasing values. """
	)
class WaterfallIncreasingMarker(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the marker color of all increasing values. """
	)
	line: Optional[Line27]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class WaterfallIncreasing(TracePropsAttribute):
	marker: Optional[WaterfallIncreasingMarker]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br> """
	)
	family: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers greater than or equal to 1<br> """
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
class WaterfallLegendgrouptitle(TracePropsAttribute):
	font: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets this legend group's title font. """
	)
	text: Optional[str]= Field(
		None,
		description=""" string<br>Sets the title of the legend group. """
	)
class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br> """
	)
	family: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers greater than or equal to 1<br> """
	)
class FontInsidetextfontTextfontOutsidetextfont1(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br> """
	)
	family: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>HTML font family - the typeface that will be applied by the web browser. The web browser will only be able to apply a font if it is available on the system which it operates. Provide multiple font families, separated by commas, to indicate the preference in which to apply fonts if they aren't available on the system. The Chart Studio Cloud (at https://chart-studio.plotly.com or on-premise) generates images on a server, where only a select number of fonts are installed and supported. These include "Arial", "Balto", "Courier New", "Droid Sans",, "Droid Serif", "Droid Sans Mono", "Gravitas One", "Old Standard TT", "Open Sans", "Overpass", "PT Sans Narrow", "Raleway", "Times New Roman". """
	)
	size: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers greater than or equal to 1<br> """
	)
class Line26(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the line color of all intermediate sums and total values. """
	)
	width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the line width of all intermediate sums and total values. """
	)
class WaterfallTotalsMarker(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the marker color of all intermediate sums and total values. """
	)
	line: Optional[Line26]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class WaterfallTotals(TracePropsAttribute):
	marker: Optional[WaterfallTotalsMarker]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class Waterfall(TraceProps):
	alignmentgroup: Optional[str]= Field(
		None,
		description=""" string<br>Set several traces linked to the same position axis or matching axes to the same alignmentgroup. This controls whether bars compute their positional range dependently or independently. """
	)
	base: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets where the bar base is drawn (in position axis units). """
	)
	cliponaxis: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether the text nodes are clipped about the subplot axes. To show the text nodes above axis lines and tick labels, make sure to set `xaxis.layer` and `yaxis.layer` to "below traces". """
	)
	connector: Optional[WaterfallConnector]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	constraintext: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "inside" | "outside" | "both" | "none" )<br>Constrain the size of text inside or outside a bar to be no larger than the bar itself. """
	)
	customdata: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns extra data each datum. This may be useful when listening to hover, click and selection events. Note that, "scatter" traces also appends customdata items in the markers DOM elements """
	)
	decreasing: Optional[WaterfallDecreasing]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	dx: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the x coordinate step. See `x0` for more info. """
	)
	dy: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the y coordinate step. See `y0` for more info. """
	)
	hoverinfo: Optional[str]= Field(
		None,
		description=""" flaglist string. any combination of "name", "x", "y", "text", "initial", "delta", "final" joined with a "+" or "all" or "none" or "skip".<br>Determines which trace information appear on hover. If `none` or `skip` are set, no information is displayed upon hovering. But, if `none` is set, click and hover events are still fired. """
	)
	hoverlabel: Optional[WaterfallHoverlabel]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	hovertemplate: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Template string used for rendering the information that appear on hover box. Note that this will override `hoverinfo`. Variables are inserted using %{variable}, for example "y: %{y}" as well as %{xother}, {%_xother}, {%_xother_}, {%xother_}. When showing info for several points, "xother" will be added to those with different x positions from the first point. An underscore before or after "(x|y)other" will add a space on that side, only when this field is shown. Numbers are formatted using d3-format's syntax %{variable:d3-format}, for example "Price: %{y:$.2f}". https://github.com/d3/d3-format/tree/v1.4.5#d3-format for details on the formatting syntax. Dates are formatted using d3-time-format's syntax %{variable|d3-time-format}, for example "Day: %{2019-01-01|%A}". https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format for details on the date formatting syntax. The variables available in `hovertemplate` are the ones emitted as event data described at this link https://plotly.com/javascript/plotlyjs-events/#event-data. Additionally, every attributes that can be specified per-point (the ones that are `arrayOk: true`) are available. variables `initial`, `delta` and `final`. Anything contained in tag `<extra>` is displayed in the secondary box, for example "<extra>{fullData.name}</extra>". To hide the secondary box completely, use an empty tag `<extra></extra>`. """
	)
	hovertext: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Sets hover text elements associated with each (x,y) pair. If a single string, the same string appears over all the data points. If an array of string, the items are mapped in order to the this trace's (x,y) coordinates. To be seen, trace `hoverinfo` must contain a "text" flag. """
	)
	ids: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns id labels to each datum. These ids for object constancy of data points during animation. Should be an array of strings, not numbers or any other type. """
	)
	increasing: Optional[WaterfallIncreasing]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	insidetextanchor: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "end" | "middle" | "start" )<br>Determines if texts are kept at center or start/end points in `textposition` "inside" mode. """
	)
	insidetextfont: Optional[FontInsidetextfontTextfontOutsidetextfont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the font used for `text` lying inside the bar. """
	)
	legendgroup: Optional[str]= Field(
		None,
		description=""" string<br>Sets the legend group for this trace. Traces part of the same legend group hide/show at the same time when toggling legend items. """
	)
	legendgrouptitle: Optional[WaterfallLegendgrouptitle]= Field(
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
	measure: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>An array containing types of values. By default the values are considered as 'relative'. However; it is possible to use 'total' to compute the sums. Also 'absolute' could be applied to reset the computed total or to declare an initial value where needed. """
	)
	meta: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Assigns extra meta information associated with this trace that can be used in various text attributes. Attributes such as trace `name`, graph, axis and colorbar `title.text`, annotation `text` `rangeselector`, `updatemenues` and `sliders` `label` text all support `meta`. To access the trace `meta` values in an attribute in the same trace, simply use `%{meta[i]}` where `i` is the index or key of the `meta` item in question. To access trace `meta` in layout attributes, use `%{data[n[.meta[i]}` where `i` is the index or key of the `meta` and `n` is the trace index. """
	)
	offset: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers<br>Shifts the position where the bar is drawn (in position axis units). In "group" barmode, traces that set "offset" will be excluded and drawn in "overlay" mode instead. """
	)
	offsetgroup: Optional[str]= Field(
		None,
		description=""" string<br>Set several traces linked to the same position axis or matching axes to the same offsetgroup where bars of the same position coordinate will line up. """
	)
	opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 1<br>Sets the opacity of the trace. """
	)
	orientation: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "v" | "h" )<br>Sets the orientation of the bars. With "v" ("h"), the value of the each bar spans along the vertical (horizontal). """
	)
	outsidetextfont: Optional[FontInsidetextfontTextfontOutsidetextfont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the font used for `text` lying outside the bar. """
	)
	selectedpoints: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Array containing integer indices of selected points. Has an effect only for traces that support selections. Note that an empty array means an empty selection where the `unselected` are turned on for all points, whereas, any other non-array values means no selection all where the `selected` and `unselected` styles have no effect. """
	)
	showlegend: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether or not an item corresponding to this trace is shown in the legend. """
	)
	text: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Sets text elements associated with each (x,y) pair. If a single string, the same string appears over all the data points. If an array of string, the items are mapped in order to the this trace's (x,y) coordinates. If trace `hoverinfo` contains a "text" flag and "hovertext" is not set, these elements will be seen in the hover labels. """
	)
	textangle: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" angle<br>Sets the angle of the tick labels with respect to the bar. For example, a `tickangle` of -90 draws the tick labels vertically. With "auto" the texts may automatically be rotated to fit with the maximum size in bars. """
	)
	textfont: Optional[FontInsidetextfontTextfontOutsidetextfont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets the font used for `text`. """
	)
	textinfo: Optional[str]= Field(
		None,
		description=""" flaglist string. any combination of "label", "text", "initial", "delta", "final" joined with a "+" or "none".<br>Determines which trace information appear on the graph. In the case of having multiple waterfalls, totals are computed separately (per trace). """
	)
	textposition: Optional[str | List[str] ]= Field(
		None,
		description=""" enumerated or array of enumerateds , one of ( "inside" | "outside" | "auto" | "none" )<br>Specifies the location of the `text`. "inside" positions `text` inside, next to the bar end (rotated and scaled if needed). "outside" positions `text` outside, next to the bar end (scaled if needed), unless there is another bar stacked on this one, then the text gets pushed inside. "auto" tries to position `text` inside the bar, but if the bar is too small and no bar is stacked on this one the text is moved outside. If "none", no text appears. """
	)
	texttemplate: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Template string used for rendering the information text that appear on points. Note that this will override `textinfo`. Variables are inserted using %{variable}, for example "y: %{y}". Numbers are formatted using d3-format's syntax %{variable:d3-format}, for example "Price: %{y:$.2f}". https://github.com/d3/d3-format/tree/v1.4.5#d3-format for details on the formatting syntax. Dates are formatted using d3-time-format's syntax %{variable|d3-time-format}, for example "Day: %{2019-01-01|%A}". https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format for details on the date formatting syntax. Every attributes that can be specified per-point (the ones that are `arrayOk: true`) are available. variables `initial`, `delta`, `final` and `label`. """
	)
	totals: Optional[WaterfallTotals]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	type: Literal["waterfall"]= Field(
		...,
		description=""" "waterfall"<br> """
	)
	uirevision: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Controls persistence of some user-driven changes to the trace: `constraintrange` in `parcoords` traces, as well as some `editable: true` modifications such as `name` and `colorbar.title`. Defaults to `layout.uirevision`. Note that other user-driven trace attribute changes are controlled by `layout` attributes: `trace.visible` is controlled by `layout.legend.uirevision`, `selectedpoints` is controlled by `layout.selectionrevision`, and `colorbar.(x|y)` (accessible with `config: {editable: true}`) is controlled by `layout.editrevision`. Trace changes are tracked by `uid`, which only falls back on trace index if no `uid` is provided. So if your app can add/remove traces before the end of the `data` array, such that the same trace has a different index, you can still preserve user-driven changes if you give each trace a `uid` that stays with it as it moves. """
	)
	visible: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( true | false | "legendonly" )<br>Determines whether or not this trace is visible. If "legendonly", the trace is not drawn, but can appear as a legend item (provided that the legend itself is visible). """
	)
	width: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers greater than or equal to 0<br>Sets the bar width (in position axis units). """
	)
	x0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Alternate to `x`. Builds a linear space of x coordinates. Use with `dx` where `x0` is the starting coordinate and `dx` the step. """
	)
	x: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the x coordinates. """
	)
	xaxis: Optional[str]= Field(
		None,
		description=""" subplotid<br>Sets a reference between this trace's x coordinates and a 2D cartesian x axis. If "x" (the default value), the x coordinates refer to `layout.xaxis`. If "x2", the x coordinates refer to `layout.xaxis2`, and so on. """
	)
	xhoverformat: Optional[str]= Field(
		None,
		description=""" string<br>Sets the hover text formatting rulefor `x` using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. And for dates see: https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format. We add two items to d3's date formatter: "%h" for half of the year as a decimal number as well as "%{n}f" for fractional seconds with n digits. For example, "2016-10-13 09:15:23.456" with tickformat "%H~%M~%S.%2f" would display "09~15~23.46"By default the values are formatted using `xaxis.hoverformat`. """
	)
	xperiod0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the base for period positioning in milliseconds or date string on the x0 axis. When `x0period` is round number of weeks, the `x0period0` by default would be on a Sunday i.e. 2000-01-02, otherwise it would be at 2000-01-01. """
	)
	xperiod: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the period positioning in milliseconds or "M<n>" on the x axis. Special values in the form of "M<n>" could be used to declare the number of months. In this case `n` must be a positive integer. """
	)
	xperiodalignment: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "start" | "middle" | "end" )<br>Only relevant when the axis `type` is "date". Sets the alignment of data points on the x axis. """
	)
	y0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Alternate to `y`. Builds a linear space of y coordinates. Use with `dy` where `y0` is the starting coordinate and `dy` the step. """
	)
	y: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the y coordinates. """
	)
	yaxis: Optional[str]= Field(
		None,
		description=""" subplotid<br>Sets a reference between this trace's y coordinates and a 2D cartesian y axis. If "y" (the default value), the y coordinates refer to `layout.yaxis`. If "y2", the y coordinates refer to `layout.yaxis2`, and so on. """
	)
	yhoverformat: Optional[str]= Field(
		None,
		description=""" string<br>Sets the hover text formatting rulefor `y` using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. And for dates see: https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format. We add two items to d3's date formatter: "%h" for half of the year as a decimal number as well as "%{n}f" for fractional seconds with n digits. For example, "2016-10-13 09:15:23.456" with tickformat "%H~%M~%S.%2f" would display "09~15~23.46"By default the values are formatted using `yaxis.hoverformat`. """
	)
	yperiod0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the base for period positioning in milliseconds or date string on the y0 axis. When `y0period` is round number of weeks, the `y0period0` by default would be on a Sunday i.e. 2000-01-02, otherwise it would be at 2000-01-01. """
	)
	yperiod: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Only relevant when the axis `type` is "date". Sets the period positioning in milliseconds or "M<n>" on the y axis. Special values in the form of "M<n>" could be used to declare the number of months. In this case `n` must be a positive integer. """
	)
	yperiodalignment: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "start" | "middle" | "end" )<br>Only relevant when the axis `type` is "date". Sets the alignment of data points on the y axis. """
	)