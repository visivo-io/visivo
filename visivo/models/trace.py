import re
from .base_model import BaseModel, REF_REGEX
from .test import Test
from enum import Enum
from pydantic import Extra
from typing import Optional, List
from collections import Counter


class TypeEnum(str, Enum):
    line = "line"
    mesh3d = "mesh3d"
    barpolar = "barpolar"
    streamtube = "streamtube"
    cone = "cone"
    scattermapbox = "scattermapbox"
    scattergeo = "scattergeo"
    scatterpolar = "scatterpolar"
    sunburst = "sunburst"
    histogram2d = "histogram2d"
    heatmap = "heatmap"
    scatter = "scatter"
    image = "image"
    ohlc = "ohlc"
    indicator = "indicator"
    funnelarea = "funnelarea"
    carpet = "carpet"
    heatmapgl = "heatmapgl"
    contour = "contour"
    scatterternary = "scatterternary"
    parcats = "parcats"
    treemap = "treemap"
    funnel = "funnel"
    histogram2dcontour = "histogram2dcontour"
    table = "table"
    parcoords = "parcoords"
    pie = "pie"
    splom = "splom"
    choropleth = "choropleth"
    bar = "bar"
    candlestick = "candlestick"
    scatter3d = "scatter3d"
    scattersmith = "scattersmith"
    isosurface = "isosurface"
    histogram = "histogram"
    volume = "volume"
    icicle = "icicle"
    surface = "surface"
    densitymapbox = "densitymapbox"
    contourcarpet = "contourcarpet"
    box = "box"
    scatterpolargl = "scatterpolargl"
    scattergl = "scattergl"
    choroplethmapbox = "choroplethmapbox"
    violin = "violin"
    sankey = "sankey"
    scattercarpet = "scattercarpet"
    waterfall = "waterfall"


class InvalidTestConiguration(Exception):
    pass


class Trace(BaseModel, extra=Extra.allow):
    type: TypeEnum = TypeEnum.line
    changed: Optional[bool] = True
    base_sql: str
    cohort_on: Optional[str]
    order_by: Optional[List[str]]
    filters: Optional[List[str]]
    tests: Optional[List[dict]]

    def all_tests(self) -> List[Optional[Test]]:
        tests = []
        type_counter = Counter()
        for test in self.tests:
            if len(test.keys()) > 1:
                raise InvalidTestConiguration(
                    f"Test in {self.name} has more than one type key"
                )
            type = list(test.keys())[0]
            type_counter.update({type: 1})
            kwargs = test[type]
            name = f"{self.name}-{type}-{type_counter[type]}"
            tests.append(Test(name=name, type=type, kwargs=kwargs))
        return tests
