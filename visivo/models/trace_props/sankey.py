from pydantic import Field, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.trace_props.trace_props import TraceProps, TracePropsAttribute
from typing import List, Literal, Optional, Any


class Domain2(TracePropsAttribute):
    column: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this column in the grid for this sankey trace . """,
    )
    row: Optional[int | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" integer greater than or equal to 0<br>If there is a layout grid, use the domain for this row in the grid for this sankey trace . """,
    )
    x: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" array<br>Sets the horizontal domain of this sankey trace (in plot fraction). """,
    )
    y: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" array<br>Sets the vertical domain of this sankey trace (in plot fraction). """,
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


class SankeyHoverlabel(TracePropsAttribute):
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


class SankeyLegendgrouptitle(TracePropsAttribute):
    font: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets this legend group's title font. """,
    )
    text: Optional[str] = Field(
        None, description=""" string<br>Sets the title of the legend group. """
    )


class Colorscales1(TracePropsAttribute):
    cmax: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number<br>Sets the upper bound of the color domain. """
    )
    cmin: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None, description=""" number<br>Sets the lower bound of the color domain. """
    )
    colorscale: Optional[Any] = Field(
        None,
        description=""" colorscale<br>Sets the colorscale. The colorscale must be an array containing arrays mapping a normalized value to an rgb, rgba, hex, hsl, hsv, or named color string. At minimum, a mapping for the lowest (0) and highest (1) values are required. For example, `[[0, 'rgb(0,0,255)'], [1, 'rgb(255,0,0)']]`. To control the bounds of the colorscale in color space, use `cmin` and `cmax`. Alternatively, `colorscale` may be a palette name string of the following list: Blackbody,Bluered,Blues,Cividis,Earth,Electric,Greens,Greys,Hot,Jet,Picnic,Portland,Rainbow,RdBu,Reds,Viridis,YlGnBu,YlOrRd. """,
    )
    label: Optional[str] = Field(
        None,
        description=""" string<br>The label of the links to color based on their concentration within a flow. """,
    )
    name: Optional[str] = Field(
        None,
        description=""" string<br>When used in a template, named items are created in the output figure in addition to any items the figure already has in this array. You can modify these items in the output figure by making your own item with `templateitemname` matching this `name` alongside your modifications (including `visible: false` or `enabled: false` to hide it). Has no effect outside of a template. """,
    )
    templateitemname: Optional[str] = Field(
        None,
        description=""" string<br>Used to refer to a named item in this array in the template. Named items from the template will be created even without a matching item in the input figure, but you can modify one by making an item with `templateitemname` matching its `name`, alongside your modifications (including `visible: false` or `enabled: false` to hide it). If there is no template or no matching item, this item will be hidden unless you explicitly show it with `visible: true`. """,
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


class SankeyLinkHoverlabel(TracePropsAttribute):
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


class Line20(TracePropsAttribute):
    color: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the color of the `line` around each `link`. """,
    )
    width: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 0<br>Sets the width (in px) of the `line` around each `link`. """,
    )


class SankeyLink(TracePropsAttribute):
    arrowlen: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the length (in px) of the links arrow, if 0 no arrow will be drawn. """,
    )
    color: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the `link` color. It can be a single value, or an array for specifying color for each `link`. If `link.color` is omitted, then by default, a translucent grey link will be used. """,
    )
    colorscales: Optional[List[Colorscales1]] = Field(
        None,
        description=""" array of object where each object has one or more of the keys listed below.<br> """,
    )
    customdata: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" data array<br>Assigns extra data to each link. """
    )
    hoverinfo: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "all" | "none" | "skip" )<br>Determines which trace information appear when hovering links. If `none` or `skip` are set, no information is displayed upon hovering. But, if `none` is set, click and hover events are still fired. """,
    )
    hoverlabel: Optional[SankeyLinkHoverlabel] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    hovertemplate: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>Template string used for rendering the information that appear on hover box. Note that this will override `hoverinfo`. Variables are inserted using %{variable}, for example "y: %{y}" as well as %{xother}, {%_xother}, {%_xother_}, {%xother_}. When showing info for several points, "xother" will be added to those with different x positions from the first point. An underscore before or after "(x|y)other" will add a space on that side, only when this field is shown. Numbers are formatted using d3-format's syntax %{variable:d3-format}, for example "Price: %{y:$.2f}". https://github.com/d3/d3-format/tree/v1.4.5#d3-format for details on the formatting syntax. Dates are formatted using d3-time-format's syntax %{variable|d3-time-format}, for example "Day: %{2019-01-01|%A}". https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format for details on the date formatting syntax. The variables available in `hovertemplate` are the ones emitted as event data described at this link https://plotly.com/javascript/plotlyjs-events/#event-data. Additionally, every attributes that can be specified per-point (the ones that are `arrayOk: true`) are available. variables `value` and `label`. Anything contained in tag `<extra>` is displayed in the secondary box, for example "<extra>{fullData.name}</extra>". To hide the secondary box completely, use an empty tag `<extra></extra>`. """,
    )
    label: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" data array<br>The shown name of the link. """
    )
    line: Optional[Line20] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    source: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>An integer number `[0..nodes.length - 1]` that represents the source node. """,
    )
    target: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>An integer number `[0..nodes.length - 1]` that represents the target node. """,
    )
    value: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>A numeric value representing the flow volume value. """,
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


class SankeyNodeHoverlabel(TracePropsAttribute):
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


class Line21(TracePropsAttribute):
    color: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the color of the `line` around each `node`. """,
    )
    width: Optional[
        constr(pattern=INDEXED_STATEMENT_REGEX)
        | constr(pattern=STATEMENT_REGEX)
        | float
        | List[float]
    ] = Field(
        None,
        description=""" number or array of numbers greater than or equal to 0<br>Sets the width (in px) of the `line` around each `node`. """,
    )


class SankeyNode(TracePropsAttribute):
    color: Optional[str | List[str]] = Field(
        None,
        description=""" color or array of colors<br>Sets the `node` color. It can be a single value, or an array for specifying color for each `node`. If `node.color` is omitted, then the default `Plotly` color palette will be cycled through to have a variety of colors. These defaults are not fully opaque, to allow some visibility of what is beneath the node. """,
    )
    customdata: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" data array<br>Assigns extra data to each node. """
    )
    groups: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" array<br>Groups of nodes. Each group is defined by an array with the indices of the nodes it contains. Multiple groups can be specified. """,
    )
    hoverinfo: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "all" | "none" | "skip" )<br>Determines which trace information appear when hovering nodes. If `none` or `skip` are set, no information is displayed upon hovering. But, if `none` is set, click and hover events are still fired. """,
    )
    hoverlabel: Optional[SankeyNodeHoverlabel] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    hovertemplate: Optional[str | List[str]] = Field(
        None,
        description=""" string or array of strings<br>Template string used for rendering the information that appear on hover box. Note that this will override `hoverinfo`. Variables are inserted using %{variable}, for example "y: %{y}" as well as %{xother}, {%_xother}, {%_xother_}, {%xother_}. When showing info for several points, "xother" will be added to those with different x positions from the first point. An underscore before or after "(x|y)other" will add a space on that side, only when this field is shown. Numbers are formatted using d3-format's syntax %{variable:d3-format}, for example "Price: %{y:$.2f}". https://github.com/d3/d3-format/tree/v1.4.5#d3-format for details on the formatting syntax. Dates are formatted using d3-time-format's syntax %{variable|d3-time-format}, for example "Day: %{2019-01-01|%A}". https://github.com/d3/d3-time-format/tree/v2.2.3#locale_format for details on the date formatting syntax. The variables available in `hovertemplate` are the ones emitted as event data described at this link https://plotly.com/javascript/plotlyjs-events/#event-data. Additionally, every attributes that can be specified per-point (the ones that are `arrayOk: true`) are available. variables `value` and `label`. Anything contained in tag `<extra>` is displayed in the secondary box, for example "<extra>{fullData.name}</extra>". To hide the secondary box completely, use an empty tag `<extra></extra>`. """,
    )
    label: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None, description=""" data array<br>The shown name of the node. """
    )
    line: Optional[Line21] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    pad: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 0<br>Sets the padding (in px) between the `nodes`. """,
    )
    thickness: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number greater than or equal to 1<br>Sets the thickness (in px) of the `nodes`. """,
    )
    x: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>The normalized horizontal position of the node. """,
    )
    y: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>The normalized vertical position of the node. """,
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


class Sankey(TraceProps):
    arrangement: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "snap" | "perpendicular" | "freeform" | "fixed" )<br>If value is `snap` (the default), the node arrangement is assisted by automatic snapping of elements to preserve space between nodes specified via `nodepad`. If value is `perpendicular`, the nodes can only move along a line perpendicular to the flow. If value is `freeform`, the nodes can freely move on the plane. If value is `fixed`, the nodes are stationary. """,
    )
    customdata: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Assigns extra data each datum. This may be useful when listening to hover, click and selection events. Note that, "scatter" traces also appends customdata items in the markers DOM elements """,
    )
    domain: Optional[Domain2] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    hoverinfo: Optional[str] = Field(
        None,
        description=""" flaglist string. any combination of joined with a "+" or "all" or "none" or "skip".<br>Determines which trace information appear on hover. If `none` or `skip` are set, no information is displayed upon hovering. But, if `none` is set, click and hover events are still fired. Note that this attribute is superseded by `node.hoverinfo` and `node.hoverinfo` for nodes and links respectively. """,
    )
    hoverlabel: Optional[SankeyHoverlabel] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br> """,
    )
    ids: Optional[constr(pattern=STATEMENT_REGEX) | List] = Field(
        None,
        description=""" data array<br>Assigns id labels to each datum. These ids for object constancy of data points during animation. Should be an array of strings, not numbers or any other type. """,
    )
    legendgrouptitle: Optional[SankeyLegendgrouptitle] = Field(
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
    link: Optional[SankeyLink] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>The links of the Sankey plot. """,
    )
    meta: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Assigns extra meta information associated with this trace that can be used in various text attributes. Attributes such as trace `name`, graph, axis and colorbar `title.text`, annotation `text` `rangeselector`, `updatemenues` and `sliders` `label` text all support `meta`. To access the trace `meta` values in an attribute in the same trace, simply use `%{meta[i]}` where `i` is the index or key of the `meta` item in question. To access trace `meta` in layout attributes, use `%{data[n[.meta[i]}` where `i` is the index or key of the `meta` and `n` is the trace index. """,
    )
    node: Optional[SankeyNode] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>The nodes of the Sankey plot. """,
    )
    orientation: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( "v" | "h" )<br>Sets the orientation of the Sankey diagram. """,
    )
    selectedpoints: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Array containing integer indices of selected points. Has an effect only for traces that support selections. Note that an empty array means an empty selection where the `unselected` are turned on for all points, whereas, any other non-array values means no selection all where the `selected` and `unselected` styles have no effect. """,
    )
    textfont: Optional[
        TextfontLabelfontTickfontInsidetextfontRangefontOutsidetextfontFontGrouptitlefont1
    ] = Field(
        None,
        description=""" object containing one or more of the keys listed below.<br>Sets the font for node labels """,
    )
    type: Literal["sankey"] = Field(..., description=""" "sankey"<br> """)
    uirevision: Optional[float | constr(pattern=INDEXED_STATEMENT_REGEX)] = Field(
        None,
        description=""" number or categorical coordinate string<br>Controls persistence of some user-driven changes to the trace: `constraintrange` in `parcoords` traces, as well as some `editable: true` modifications such as `name` and `colorbar.title`. Defaults to `layout.uirevision`. Note that other user-driven trace attribute changes are controlled by `layout` attributes: `trace.visible` is controlled by `layout.legend.uirevision`, `selectedpoints` is controlled by `layout.selectionrevision`, and `colorbar.(x|y)` (accessible with `config: {editable: true}`) is controlled by `layout.editrevision`. Trace changes are tracked by `uid`, which only falls back on trace index if no `uid` is provided. So if your app can add/remove traces before the end of the `data` array, such that the same trace has a different index, you can still preserve user-driven changes if you give each trace a `uid` that stays with it as it moves. """,
    )
    valueformat: Optional[str] = Field(
        None,
        description=""" string<br>Sets the value formatting rule using d3 formatting mini-languages which are very similar to those in Python. For numbers, see: https://github.com/d3/d3-format/tree/v1.4.5#d3-format. """,
    )
    valuesuffix: Optional[str] = Field(
        None,
        description=""" string<br>Adds a unit to follow the value in the hover tooltip. Add a space if a separation is necessary from the value. """,
    )
    visible: Optional[str] = Field(
        None,
        description=""" enumerated , one of ( true | false | "legendonly" )<br>Determines whether or not this trace is visible. If "legendonly", the trace is not drawn, but can appear as a legend item (provided that the legend itself is visible). """,
    )
