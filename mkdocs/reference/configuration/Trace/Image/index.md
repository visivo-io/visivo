```
colormodel: enumerated , one of ( "rgb" | "rgba" | "rgba256" | "hsl" | "hsla" )
customdata: data array
dx: number
dy: number
hoverinfo: flaglist string. any combination of "x", "y", "z", "color", "name", "text"
  joined with a "+" or "all" or "none" or "skip".
hoverlabel:
  align: enumerated or array of enumerateds , one of ( "left" | "right" | "auto" )
  bgcolor: color or array of colors
  bordercolor: color or array of colors
  font:
    color: color or array of colors
    family: string or array of strings
    size: number or array of numbers greater than or equal to 1
  namelength: integer or array of integers greater than or equal to -1
hovertemplate: string or array of strings
hovertext: data array
ids: data array
legendgrouptitle:
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  text: string
legendrank: number
legendwidth: number greater than or equal to 0
meta: number or categorical coordinate string
opacity: number between or equal to 0 and 1
source: string
text: data array
type: image
uirevision: number or categorical coordinate string
visible: enumerated , one of ( true | false | "legendonly" )
x0: number or categorical coordinate string
xaxis: subplotid
y0: number or categorical coordinate string
yaxis: subplotid
z: data array
zmax: array
zmin: array
zsmooth: enumerated , one of ( "fast" | false )

```