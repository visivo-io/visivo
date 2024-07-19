
from pydantic import Field, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.trace_props.trace_props import  TraceProps, TracePropsAttribute
from typing import List, Literal, Optional 


class Fill1(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br>Sets the cell fill color. It accepts either a specific color or an array of colors or a 2D array of colors. """
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
class Line9(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br> """
	)
	width: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers<br> """
	)
class TableCells(TracePropsAttribute):
	align: Optional[str | List[str] ]= Field(
		None,
		description=""" enumerated or array of enumerateds , one of ( "left" | "center" | "right" )<br>Sets the horizontal alignment of the `text` within the box. Has an effect only if `text` spans two or more lines (i.e. `text` contains one or more <br> HTML tags) or if an explicit width is set to override the text width. """
	)
	fill: Optional[Fill1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	font: Optional[FontInsidetextfontTextfontOutsidetextfont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	format: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the cell value formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. """
	)
	height: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>The height of cells. """
	)
	line: Optional[Line9]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	prefix: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Prefix for cell values. """
	)
	suffix: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Suffix for cell values. """
	)
	values: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Cell values. `values[m][n]` represents the value of the `n`th point in column `m`, therefore the `values[m]` vector length for all columns must be the same (longer vectors will be truncated). Each value must be a finite number or a string. """
	)
class Domain15(TracePropsAttribute):
	column: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this column in the grid for this table trace . """
	)
	row: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this row in the grid for this table trace . """
	)
	x: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" array<br>Sets the horizontal domain of this table trace (in plot fraction). """
	)
	y: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" array<br>Sets the vertical domain of this table trace (in plot fraction). """
	)
class Fill1(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br>Sets the cell fill color. It accepts either a specific color or an array of colors or a 2D array of colors. """
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
class Line9(TracePropsAttribute):
	color: Optional[str | List[str]]= Field(
		None,
		description=""" color or array of colors<br> """
	)
	width: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers<br> """
	)
class TableHeader(TracePropsAttribute):
	align: Optional[str | List[str] ]= Field(
		None,
		description=""" enumerated or array of enumerateds , one of ( "left" | "center" | "right" )<br>Sets the horizontal alignment of the `text` within the box. Has an effect only if `text` spans two or more lines (i.e. `text` contains one or more <br> HTML tags) or if an explicit width is set to override the text width. """
	)
	fill: Optional[Fill1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	font: Optional[FontInsidetextfontTextfontOutsidetextfont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	format: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the cell value formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. """
	)
	height: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>The height of cells. """
	)
	line: Optional[Line9]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	prefix: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Prefix for cell values. """
	)
	suffix: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Suffix for cell values. """
	)
	values: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Header cell values. `values[m][n]` represents the value of the `n`th point in column `m`, therefore the `values[m]` vector length for all columns must be the same (longer vectors will be truncated). Each value must be a finite number or a string. """
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
class TableHoverlabel(TracePropsAttribute):
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
class TableLegendgrouptitle(TracePropsAttribute):
	font: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets this legend group's title font. """
	)
	text: Optional[str]= Field(
		None,
		description=""" string<br>Sets the title of the legend group. """
	)
class Table(TraceProps):
	cells: Optional[TableCells]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	columnorder: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Specifies the rendered order of the data columns; for example, a value `2` at position `0` means that column index `0` in the data will be rendered as the third column, as columns have an index base of zero. """
	)
	columnwidth: Optional[constr(pattern=INDEXED_STATEMENT_REGEX) | constr(pattern=STATEMENT_REGEX) | float | List[float]]= Field(
		None,
		description=""" number or array of numbers<br>The width of columns expressed as a ratio. Columns fill the available width in proportion of their specified column widths. """
	)
	customdata: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns extra data each datum. This may be useful when listening to hover, click and selection events. Note that, "scatter" traces also appends customdata items in the markers DOM elements """
	)
	domain: Optional[Domain15]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	header: Optional[TableHeader]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	hoverinfo: Optional[str]= Field(
		None,
		description=""" flaglist string. any combination of "x", "y", "z", "text", "name" joined with a "+" or "all" or "none" or "skip".<br>Determines which trace information appear on hover. If `none` or `skip` are set, no information is displayed upon hovering. But, if `none` is set, click and hover events are still fired. """
	)
	hoverlabel: Optional[TableHoverlabel]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	ids: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns id labels to each datum. These ids for object constancy of data points during animation. Should be an array of strings, not numbers or any other type. """
	)
	legendgrouptitle: Optional[TableLegendgrouptitle]= Field(
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
	meta: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Assigns extra meta information associated with this trace that can be used in various text attributes. Attributes such as trace `name`, graph, axis and colorbar `title.text`, annotation `text` `rangeselector`, `updatemenues` and `sliders` `label` text all support `meta`. To access the trace `meta` values in an attribute in the same trace, simply use `%{meta[i]}` where `i` is the index or key of the `meta` item in question. To access trace `meta` in layout attributes, use `%{data[n[.meta[i]}` where `i` is the index or key of the `meta` and `n` is the trace index. """
	)
	type: Literal["table"]= Field(
		...,
		description=""" "table"<br> """
	)
	uirevision: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Controls persistence of some user-driven changes to the trace: `constraintrange` in `parcoords` traces, as well as some `editable: true` modifications such as `name` and `colorbar.title`. Defaults to `layout.uirevision`. Note that other user-driven trace attribute changes are controlled by `layout` attributes: `trace.visible` is controlled by `layout.legend.uirevision`, `selectedpoints` is controlled by `layout.selectionrevision`, and `colorbar.(x|y)` (accessible with `config: {editable: true}`) is controlled by `layout.editrevision`. Trace changes are tracked by `uid`, which only falls back on trace index if no `uid` is provided. So if your app can add/remove traces before the end of the `data` array, such that the same trace has a different index, you can still preserve user-driven changes if you give each trace a `uid` that stays with it as it moves. """
	)
	visible: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( true | false | "legendonly" )<br>Determines whether or not this trace is visible. If "legendonly", the trace is not drawn, but can appear as a legend item (provided that the legend itself is visible). """
	)