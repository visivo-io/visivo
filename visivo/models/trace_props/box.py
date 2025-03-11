
from pydantic import Field, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.trace_props.trace_props import  TraceProps, TracePropsAttribute
from typing import List, Literal, Optional, Any 


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
class BoxHoverlabel(TracePropsAttribute):
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
class BoxLegendgrouptitle(TracePropsAttribute):
	font: Optional[TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br>Sets this legend group's title font. """
	)
	text: Optional[str]= Field(
		None,
		description=""" string<br>Sets the title of the legend group. """
	)
class Line5(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the color of line bounding the box(es). """
	)
	width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the width (in px) of line bounding the box(es). """
	)
class Line8(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the marker.line color. It accepts either a specific color or an array of numbers that are mapped to the colorscale relative to the max and min values of the array or relative to `marker.line.cmin` and `marker.line.cmax` if set. """
	)
	outliercolor: Optional[str]= Field(
		None,
		description=""" color<br>Sets the border line color of the outlier sample points. Defaults to marker.color """
	)
	outlierwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the border line width (in px) of the outlier sample points. """
	)
	width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the width (in px) of the lines bounding the marker points. """
	)
class BoxMarker(TracePropsAttribute):
	angle: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" angle<br>Sets the marker angle in respect to `angleref`. """
	)
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the marker color. It accepts either a specific color or an array of numbers that are mapped to the colorscale relative to the max and min values of the array or relative to `marker.cmin` and `marker.cmax` if set. """
	)
	line: Optional[Line8]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 1<br>Sets the marker opacity. """
	)
	outliercolor: Optional[str]= Field(
		None,
		description=""" color<br>Sets the color of the outlier sample points. """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the marker size (in px). """
	)
	symbol: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "0" | "0" | "circle" | "100" | "100" | "circle-open" | "200" | "200" | "circle-dot" | "300" | "300" | "circle-open-dot" | "1" | "1" | "square" | "101" | "101" | "square-open" | "201" | "201" | "square-dot" | "301" | "301" | "square-open-dot" | "2" | "2" | "diamond" | "102" | "102" | "diamond-open" | "202" | "202" | "diamond-dot" | "302" | "302" | "diamond-open-dot" | "3" | "3" | "cross" | "103" | "103" | "cross-open" | "203" | "203" | "cross-dot" | "303" | "303" | "cross-open-dot" | "4" | "4" | "x" | "104" | "104" | "x-open" | "204" | "204" | "x-dot" | "304" | "304" | "x-open-dot" | "5" | "5" | "triangle-up" | "105" | "105" | "triangle-up-open" | "205" | "205" | "triangle-up-dot" | "305" | "305" | "triangle-up-open-dot" | "6" | "6" | "triangle-down" | "106" | "106" | "triangle-down-open" | "206" | "206" | "triangle-down-dot" | "306" | "306" | "triangle-down-open-dot" | "7" | "7" | "triangle-left" | "107" | "107" | "triangle-left-open" | "207" | "207" | "triangle-left-dot" | "307" | "307" | "triangle-left-open-dot" | "8" | "8" | "triangle-right" | "108" | "108" | "triangle-right-open" | "208" | "208" | "triangle-right-dot" | "308" | "308" | "triangle-right-open-dot" | "9" | "9" | "triangle-ne" | "109" | "109" | "triangle-ne-open" | "209" | "209" | "triangle-ne-dot" | "309" | "309" | "triangle-ne-open-dot" | "10" | "10" | "triangle-se" | "110" | "110" | "triangle-se-open" | "210" | "210" | "triangle-se-dot" | "310" | "310" | "triangle-se-open-dot" | "11" | "11" | "triangle-sw" | "111" | "111" | "triangle-sw-open" | "211" | "211" | "triangle-sw-dot" | "311" | "311" | "triangle-sw-open-dot" | "12" | "12" | "triangle-nw" | "112" | "112" | "triangle-nw-open" | "212" | "212" | "triangle-nw-dot" | "312" | "312" | "triangle-nw-open-dot" | "13" | "13" | "pentagon" | "113" | "113" | "pentagon-open" | "213" | "213" | "pentagon-dot" | "313" | "313" | "pentagon-open-dot" | "14" | "14" | "hexagon" | "114" | "114" | "hexagon-open" | "214" | "214" | "hexagon-dot" | "314" | "314" | "hexagon-open-dot" | "15" | "15" | "hexagon2" | "115" | "115" | "hexagon2-open" | "215" | "215" | "hexagon2-dot" | "315" | "315" | "hexagon2-open-dot" | "16" | "16" | "octagon" | "116" | "116" | "octagon-open" | "216" | "216" | "octagon-dot" | "316" | "316" | "octagon-open-dot" | "17" | "17" | "star" | "117" | "117" | "star-open" | "217" | "217" | "star-dot" | "317" | "317" | "star-open-dot" | "18" | "18" | "hexagram" | "118" | "118" | "hexagram-open" | "218" | "218" | "hexagram-dot" | "318" | "318" | "hexagram-open-dot" | "19" | "19" | "star-triangle-up" | "119" | "119" | "star-triangle-up-open" | "219" | "219" | "star-triangle-up-dot" | "319" | "319" | "star-triangle-up-open-dot" | "20" | "20" | "star-triangle-down" | "120" | "120" | "star-triangle-down-open" | "220" | "220" | "star-triangle-down-dot" | "320" | "320" | "star-triangle-down-open-dot" | "21" | "21" | "star-square" | "121" | "121" | "star-square-open" | "221" | "221" | "star-square-dot" | "321" | "321" | "star-square-open-dot" | "22" | "22" | "star-diamond" | "122" | "122" | "star-diamond-open" | "222" | "222" | "star-diamond-dot" | "322" | "322" | "star-diamond-open-dot" | "23" | "23" | "diamond-tall" | "123" | "123" | "diamond-tall-open" | "223" | "223" | "diamond-tall-dot" | "323" | "323" | "diamond-tall-open-dot" | "24" | "24" | "diamond-wide" | "124" | "124" | "diamond-wide-open" | "224" | "224" | "diamond-wide-dot" | "324" | "324" | "diamond-wide-open-dot" | "25" | "25" | "hourglass" | "125" | "125" | "hourglass-open" | "26" | "26" | "bowtie" | "126" | "126" | "bowtie-open" | "27" | "27" | "circle-cross" | "127" | "127" | "circle-cross-open" | "28" | "28" | "circle-x" | "128" | "128" | "circle-x-open" | "29" | "29" | "square-cross" | "129" | "129" | "square-cross-open" | "30" | "30" | "square-x" | "130" | "130" | "square-x-open" | "31" | "31" | "diamond-cross" | "131" | "131" | "diamond-cross-open" | "32" | "32" | "diamond-x" | "132" | "132" | "diamond-x-open" | "33" | "33" | "cross-thin" | "133" | "133" | "cross-thin-open" | "34" | "34" | "x-thin" | "134" | "134" | "x-thin-open" | "35" | "35" | "asterisk" | "135" | "135" | "asterisk-open" | "36" | "36" | "hash" | "136" | "136" | "hash-open" | "236" | "236" | "hash-dot" | "336" | "336" | "hash-open-dot" | "37" | "37" | "y-up" | "137" | "137" | "y-up-open" | "38" | "38" | "y-down" | "138" | "138" | "y-down-open" | "39" | "39" | "y-left" | "139" | "139" | "y-left-open" | "40" | "40" | "y-right" | "140" | "140" | "y-right-open" | "41" | "41" | "line-ew" | "141" | "141" | "line-ew-open" | "42" | "42" | "line-ns" | "142" | "142" | "line-ns-open" | "43" | "43" | "line-ne" | "143" | "143" | "line-ne-open" | "44" | "44" | "line-nw" | "144" | "144" | "line-nw-open" | "45" | "45" | "arrow-up" | "145" | "145" | "arrow-up-open" | "46" | "46" | "arrow-down" | "146" | "146" | "arrow-down-open" | "47" | "47" | "arrow-left" | "147" | "147" | "arrow-left-open" | "48" | "48" | "arrow-right" | "148" | "148" | "arrow-right-open" | "49" | "49" | "arrow-bar-up" | "149" | "149" | "arrow-bar-up-open" | "50" | "50" | "arrow-bar-down" | "150" | "150" | "arrow-bar-down-open" | "51" | "51" | "arrow-bar-left" | "151" | "151" | "arrow-bar-left-open" | "52" | "52" | "arrow-bar-right" | "152" | "152" | "arrow-bar-right-open" | "53" | "53" | "arrow" | "153" | "153" | "arrow-open" | "54" | "54" | "arrow-wide" | "154" | "154" | "arrow-wide-open" )<br>Sets the marker symbol type. Adding 100 is equivalent to appending "-open" to a symbol name. Adding 200 is equivalent to appending "-dot" to a symbol name. Adding 300 is equivalent to appending "-open-dot" or "dot-open" to a symbol name. """
	)
class Marker1(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the marker color of selected points. """
	)
	opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 1<br>Sets the marker opacity of selected points. """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the marker size of selected points. """
	)
class BoxSelected(TracePropsAttribute):
	marker: Optional[Marker1]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class Marker2(TracePropsAttribute):
	color: Optional[str]= Field(
		None,
		description=""" color<br>Sets the marker color of unselected points, applied only when a selection exists. """
	)
	opacity: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 1<br>Sets the marker opacity of unselected points, applied only when a selection exists. """
	)
	size: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the marker size of unselected points, applied only when a selection exists. """
	)
class BoxUnselected(TracePropsAttribute):
	marker: Optional[Marker2]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
class Box(TraceProps):
	alignmentgroup: Optional[str]= Field(
		None,
		description=""" string<br>Set several traces linked to the same position axis or matching axes to the same alignmentgroup. This controls whether bars compute their positional range dependently or independently. """
	)
	boxmean: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( true | "sd" | false )<br>If "true", the mean of the box(es)' underlying distribution is drawn as a dashed line inside the box(es). If "sd" the standard deviation is also drawn. Defaults to "true" when `mean` is set. Defaults to "sd" when `sd` is set Otherwise defaults to "false". """
	)
	boxpoints: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "all" | "outliers" | "suspectedoutliers" | false )<br>If "outliers", only the sample points lying outside the whiskers are shown If "suspectedoutliers", the outlier points are shown and points either less than 4"Q1-3"Q3 or greater than 4"Q3-3"Q1 are highlighted (see `outliercolor`) If "all", all sample points are shown If "false", only the box(es) are shown with no sample points Defaults to "suspectedoutliers" when `marker.outliercolor` or `marker.line.outliercolor` is set. Defaults to "all" under the q1/median/q3 signature. Otherwise defaults to "outliers". """
	)
	customdata: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns extra data each datum. This may be useful when listening to hover, click and selection events. Note that, "scatter" traces also appends customdata items in the markers DOM elements """
	)
	dx: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the x coordinate step for multi-box traces set using q1/median/q3. """
	)
	dy: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number<br>Sets the y coordinate step for multi-box traces set using q1/median/q3. """
	)
	fillcolor: Optional[str]= Field(
		None,
		description=""" color<br>Sets the fill color. Defaults to a half-transparent variant of the line color, marker color, or marker line color, whichever is available. """
	)
	hoverinfo: Optional[str]= Field(
		None,
		description=""" flaglist string. any combination of "x", "y", "z", "text", "name" joined with a "+" or "all" or "none" or "skip".<br>Determines which trace information appear on hover. If `none` or `skip` are set, no information is displayed upon hovering. But, if `none` is set, click and hover events are still fired. """
	)
	hoverlabel: Optional[BoxHoverlabel]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	hoveron: Optional[str]= Field(
		None,
		description=""" flaglist string. any combination of "boxes", "points" joined with a "+"<br>Do the hover effects highlight individual boxes or sample points or both? """
	)
	hovertemplate: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Template string used for rendering the information that appear on hover box. Note that this will override `hoverinfo`. Variables are inserted using %{variable}, for example "y: %{y}" as well as %{xother}, {%_xother}, {%_xother_}, {%xother_}. When showing info for several points, "xother" will be added to those with different x positions from the first point. An underscore before or after "(x|y)other" will add a space on that side, only when this field is shown. Numbers are formatted using d3-format's syntax %{variable:d3-format}, for example "Price: %{y:$.2f}". https://github.com/d3/d3-format/tree/v1.4.5#d3-format for details on the formatting syntax. Dates are formatted using d3-time-format's syntax %{variable|d3-time-format}, for example "Day: %{2019-01-01|%A}". https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format for details on the date formatting syntax. The variables available in `hovertemplate` are the ones emitted as event data described at this link https://plotly.com/javascript/plotlyjs-events/#event-data. Additionally, every attributes that can be specified per-point (the ones that are `arrayOk: true`) are available. Anything contained in tag `<extra>` is displayed in the secondary box, for example "<extra>{fullData.name}</extra>". To hide the secondary box completely, use an empty tag `<extra></extra>`. """
	)
	hovertext: Optional[str | List[str]]= Field(
		None,
		description=""" string or array of strings<br>Same as `text`. """
	)
	ids: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Assigns id labels to each datum. These ids for object constancy of data points during animation. Should be an array of strings, not numbers or any other type. """
	)
	jitter: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 1<br>Sets the amount of jitter in the sample points drawn. If "0", the sample points align along the distribution axis. If "1", the sample points are drawn in a random jitter of width equal to the width of the box(es). """
	)
	legendgroup: Optional[str]= Field(
		None,
		description=""" string<br>Sets the legend group for this trace. Traces part of the same legend group hide/show at the same time when toggling legend items. """
	)
	legendgrouptitle: Optional[BoxLegendgrouptitle]= Field(
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
	line: Optional[Line5]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	lowerfence: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the lower fence values. There should be as many items as the number of boxes desired. This attribute has effect only under the q1/median/q3 signature. If `lowerfence` is not provided but a sample (in `y` or `x`) is set, we compute the lower as the last sample point below 1.5 times the IQR. """
	)
	marker: Optional[BoxMarker]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	mean: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the mean values. There should be as many items as the number of boxes desired. This attribute has effect only under the q1/median/q3 signature. If `mean` is not provided but a sample (in `y` or `x`) is set, we compute the mean for each box using the sample values. """
	)
	median: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the median values. There should be as many items as the number of boxes desired. """
	)
	meta: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Assigns extra meta information associated with this trace that can be used in various text attributes. Attributes such as trace `name`, graph, axis and colorbar `title.text`, annotation `text` `rangeselector`, `updatemenues` and `sliders` `label` text all support `meta`. To access the trace `meta` values in an attribute in the same trace, simply use `%{meta[i]}` where `i` is the index or key of the `meta` item in question. To access trace `meta` in layout attributes, use `%{data[n[.meta[i]}` where `i` is the index or key of the `meta` and `n` is the trace index. """
	)
	notched: Optional[bool | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" boolean<br>Determines whether or not notches are drawn. Notches displays a confidence interval around the median. We compute the confidence interval as median +/- 1.57 " IQR / sqrt(N), where IQR is the interquartile range and N is the sample size. If two boxes' notches do not overlap there is 95% confidence their medians differ. See https://sites.google.com/site/davidsstatistics/home/notched-box-plots for more info. Defaults to "false" unless `notchwidth` or `notchspan` is set. """
	)
	notchspan: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the notch span from the boxes' `median` values. There should be as many items as the number of boxes desired. This attribute has effect only under the q1/median/q3 signature. If `notchspan` is not provided but a sample (in `y` or `x`) is set, we compute it as 1.57 " IQR / sqrt(N), where N is the sample size. """
	)
	notchwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 0.5<br>Sets the width of the notches relative to the box' width. For example, with 0, the notches are as wide as the box(es). """
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
		description=""" enumerated , one of ( "v" | "h" )<br>Sets the orientation of the box(es). If "v" ("h"), the distribution is visualized along the vertical (horizontal). """
	)
	pointpos: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to -2 and 2<br>Sets the position of the sample points in relation to the box(es). If "0", the sample points are places over the center of the box(es). Positive (negative) values correspond to positions to the right (left) for vertical boxes and above (below) for horizontal boxes """
	)
	q1: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the Quartile 1 values. There should be as many items as the number of boxes desired. """
	)
	q3: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the Quartile 3 values. There should be as many items as the number of boxes desired. """
	)
	quartilemethod: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "linear" | "exclusive" | "inclusive" )<br>Sets the method used to compute the sample's Q1 and Q3 quartiles. The "linear" method uses the 25th percentile for Q1 and 75th percentile for Q3 as computed using method #10 (listed on http://jse.amstat.org/v14n3/langford.html). The "exclusive" method uses the median to divide the ordered dataset into two halves if the sample is odd, it does not include the median in either half - Q1 is then the median of the lower half and Q3 the median of the upper half. The "inclusive" method also uses the median to divide the ordered dataset into two halves but if the sample is odd, it includes the median in both halves - Q1 is then the median of the lower half and Q3 the median of the upper half. """
	)
	sd: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the standard deviation values. There should be as many items as the number of boxes desired. This attribute has effect only under the q1/median/q3 signature. If `sd` is not provided but a sample (in `y` or `x`) is set, we compute the standard deviation for each box using the sample values. """
	)
	selected: Optional[BoxSelected]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
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
		description=""" string or array of strings<br>Sets the text elements associated with each sample value. If a single string, the same string appears over all the data points. If an array of string, the items are mapped in order to the this trace's (x,y) coordinates. To be seen, trace `hoverinfo` must contain a "text" flag. """
	)
	type: Literal["box"]= Field(
		...,
		description=""" "box"<br> """
	)
	uirevision: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Controls persistence of some user-driven changes to the trace: `constraintrange` in `parcoords` traces, as well as some `editable: true` modifications such as `name` and `colorbar.title`. Defaults to `layout.uirevision`. Note that other user-driven trace attribute changes are controlled by `layout` attributes: `trace.visible` is controlled by `layout.legend.uirevision`, `selectedpoints` is controlled by `layout.selectionrevision`, and `colorbar.(x|y)` (accessible with `config: {editable: true}`) is controlled by `layout.editrevision`. Trace changes are tracked by `uid`, which only falls back on trace index if no `uid` is provided. So if your app can add/remove traces before the end of the `data` array, such that the same trace has a different index, you can still preserve user-driven changes if you give each trace a `uid` that stays with it as it moves. """
	)
	unselected: Optional[BoxUnselected]= Field(
		None,
		description=""" object containing one or more of the keys listed below.<br> """
	)
	upperfence: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the upper fence values. There should be as many items as the number of boxes desired. This attribute has effect only under the q1/median/q3 signature. If `upperfence` is not provided but a sample (in `y` or `x`) is set, we compute the lower as the last sample point above 1.5 times the IQR. """
	)
	visible: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( true | false | "legendonly" )<br>Determines whether or not this trace is visible. If "legendonly", the trace is not drawn, but can appear as a legend item (provided that the legend itself is visible). """
	)
	whiskerwidth: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number between or equal to 0 and 1<br>Sets the width of the whiskers relative to the box' width. For example, with 1, the whiskers are as wide as the box(es). """
	)
	width: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number greater than or equal to 0<br>Sets the width of the box in data coordinate If "0" (default value) the width is automatically selected based on the positions of other box traces in the same subplot. """
	)
	x0: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)]= Field(
		None,
		description=""" number or categorical coordinate string<br>Sets the x coordinate for single-box traces or the starting coordinate for multi-box traces set using q1/median/q3. See overview for more info. """
	)
	x: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the x sample data or coordinates. See overview for more info. """
	)
	xaxis: Optional[str]= Field(
		None,
		description=""" subplotid<br>Sets a reference between this trace's x coordinates and a 2D cartesian x axis. If "x" (the default value), the x coordinates refer to `layout.xaxis`. If "x2", the x coordinates refer to `layout.xaxis2`, and so on. """
	)
	xcalendar: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "chinese" | "coptic" | "discworld" | "ethiopian" | "gregorian" | "hebrew" | "islamic" | "jalali" | "julian" | "mayan" | "nanakshahi" | "nepali" | "persian" | "taiwan" | "thai" | "ummalqura" )<br>Sets the calendar system to use with `x` date data. """
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
		description=""" number or categorical coordinate string<br>Sets the y coordinate for single-box traces or the starting coordinate for multi-box traces set using q1/median/q3. See overview for more info. """
	)
	y: Optional[constr(pattern=STATEMENT_REGEX) | List]= Field(
		None,
		description=""" data array<br>Sets the y sample data or coordinates. See overview for more info. """
	)
	yaxis: Optional[str]= Field(
		None,
		description=""" subplotid<br>Sets a reference between this trace's y coordinates and a 2D cartesian y axis. If "y" (the default value), the y coordinates refer to `layout.yaxis`. If "y2", the y coordinates refer to `layout.yaxis2`, and so on. """
	)
	ycalendar: Optional[str]= Field(
		None,
		description=""" enumerated , one of ( "chinese" | "coptic" | "discworld" | "ethiopian" | "gregorian" | "hebrew" | "islamic" | "jalali" | "julian" | "mayan" | "nanakshahi" | "nepali" | "persian" | "taiwan" | "thai" | "ummalqura" )<br>Sets the calendar system to use with `y` date data. """
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