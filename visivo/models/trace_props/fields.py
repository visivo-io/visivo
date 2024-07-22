from visivo.models.trace_props.bar import Bar
from visivo.models.trace_props.barpolar import Barpolar
from visivo.models.trace_props.box import Box
from visivo.models.trace_props.candlestick import Candlestick
from visivo.models.trace_props.carpet import Carpet
from visivo.models.trace_props.choropleth import Choropleth
from visivo.models.trace_props.choroplethmapbox import Choroplethmapbox
from visivo.models.trace_props.cone import Cone
from visivo.models.trace_props.contour import Contour
from visivo.models.trace_props.contourcarpet import Contourcarpet
from visivo.models.trace_props.densitymapbox import Densitymapbox
from visivo.models.trace_props.funnel import Funnel
from visivo.models.trace_props.funnelarea import Funnelarea
from visivo.models.trace_props.heatmap import Heatmap
from visivo.models.trace_props.heatmapgl import Heatmapgl
from visivo.models.trace_props.histogram import Histogram
from visivo.models.trace_props.histogram2d import Histogram2d
from visivo.models.trace_props.histogram2dcontour import Histogram2dcontour
from visivo.models.trace_props.icicle import Icicle
from visivo.models.trace_props.image import Image
from visivo.models.trace_props.indicator import Indicator
from visivo.models.trace_props.isosurface import Isosurface
from visivo.models.trace_props.mesh3d import Mesh3d
from visivo.models.trace_props.ohlc import Ohlc
from visivo.models.trace_props.parcats import Parcats
from visivo.models.trace_props.parcoords import Parcoords
from visivo.models.trace_props.pie import Pie
from visivo.models.trace_props.sankey import Sankey
from visivo.models.trace_props.scatter import Scatter
from visivo.models.trace_props.scatter3d import Scatter3d
from visivo.models.trace_props.scattercarpet import Scattercarpet
from visivo.models.trace_props.scattergeo import Scattergeo
from visivo.models.trace_props.scattergl import Scattergl
from visivo.models.trace_props.scattermapbox import Scattermapbox
from visivo.models.trace_props.scatterpolar import Scatterpolar
from visivo.models.trace_props.scatterpolargl import Scatterpolargl
from visivo.models.trace_props.scattersmith import Scattersmith
from visivo.models.trace_props.scatterternary import Scatterternary
from visivo.models.trace_props.splom import Splom
from visivo.models.trace_props.streamtube import Streamtube
from visivo.models.trace_props.sunburst import Sunburst
from visivo.models.trace_props.surface import Surface
from visivo.models.trace_props.treemap import Treemap
from visivo.models.trace_props.violin import Violin
from visivo.models.trace_props.volume import Volume
from visivo.models.trace_props.waterfall import Waterfall
from typing import Union, Annotated
from pydantic import Field

TracePropsFieldUnion = Union[
    Bar,
    Barpolar,
    Box,
    Candlestick,
    Carpet,
    Choropleth,
    Choroplethmapbox,
    Cone,
    Contour,
    Contourcarpet,
    Densitymapbox,
    Funnel,
    Funnelarea,
    Heatmap,
    Heatmapgl,
    Histogram,
    Histogram2d,
    Histogram2dcontour,
    Icicle,
    Image,
    Indicator,
    Isosurface,
    Mesh3d,
    Ohlc,
    Parcats,
    Parcoords,
    Pie,
    Sankey,
    Scatter,
    Scatter3d,
    Scattercarpet,
    Scattergeo,
    Scattergl,
    Scattermapbox,
    Scatterpolar,
    Scatterpolargl,
    Scattersmith,
    Scatterternary,
    Splom,
    Streamtube,
    Sunburst,
    Surface,
    Treemap,
    Violin,
    Volume,
    Waterfall,
]
TracePropsField = Annotated[TracePropsFieldUnion, Field(discriminator="type")]


def validate_trace_props(props):
    if "type" not in props:
        raise ValueError(f"trace_props type is required.")
    match props["type"]:
        case "bar":
            return Bar(**props)
        case "barpolar":
            return Barpolar(**props)
        case "box":
            return Box(**props)
        case "candlestick":
            return Candlestick(**props)
        case "carpet":
            return Carpet(**props)
        case "choropleth":
            return Choropleth(**props)
        case "choroplethmapbox":
            return Choroplethmapbox(**props)
        case "cone":
            return Cone(**props)
        case "contour":
            return Contour(**props)
        case "contourcarpet":
            return Contourcarpet(**props)
        case "densitymapbox":
            return Densitymapbox(**props)
        case "funnel":
            return Funnel(**props)
        case "funnelarea":
            return Funnelarea(**props)
        case "heatmap":
            return Heatmap(**props)
        case "heatmapgl":
            return Heatmapgl(**props)
        case "histogram":
            return Histogram(**props)
        case "histogram2d":
            return Histogram2d(**props)
        case "histogram2dcontour":
            return Histogram2dcontour(**props)
        case "icicle":
            return Icicle(**props)
        case "image":
            return Image(**props)
        case "indicator":
            return Indicator(**props)
        case "isosurface":
            return Isosurface(**props)
        case "mesh3d":
            return Mesh3d(**props)
        case "ohlc":
            return Ohlc(**props)
        case "parcats":
            return Parcats(**props)
        case "parcoords":
            return Parcoords(**props)
        case "pie":
            return Pie(**props)
        case "sankey":
            return Sankey(**props)
        case "scatter":
            return Scatter(**props)
        case "scatter3d":
            return Scatter3d(**props)
        case "scattercarpet":
            return Scattercarpet(**props)
        case "scattergeo":
            return Scattergeo(**props)
        case "scattergl":
            return Scattergl(**props)
        case "scattermapbox":
            return Scattermapbox(**props)
        case "scatterpolar":
            return Scatterpolar(**props)
        case "scatterpolargl":
            return Scatterpolargl(**props)
        case "scattersmith":
            return Scattersmith(**props)
        case "scatterternary":
            return Scatterternary(**props)
        case "splom":
            return Splom(**props)
        case "streamtube":
            return Streamtube(**props)
        case "sunburst":
            return Sunburst(**props)
        case "surface":
            return Surface(**props)
        case "treemap":
            return Treemap(**props)
        case "violin":
            return Violin(**props)
        case "volume":
            return Volume(**props)
        case "waterfall":
            return Waterfall(**props)
        case _:
            raise ValueError(f"{props['type']} is not a valid trace_props type.")
