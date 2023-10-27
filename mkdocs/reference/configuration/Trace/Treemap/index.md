```
branchvalues: enumerated , one of ( "remainder" | "total" )
count: flaglist string. any combination of "branches", "leaves" joined with a "+"
customdata: data array
domain:
  column: integer greater than or equal to 0
  row: integer greater than or equal to 0
  x: array
  y: array
hoverinfo: flaglist string. any combination of "label", "text", "value", "name", "current
  path", "percent root", "percent entry", "percent parent" joined with a "+" or "all"
  or "none" or "skip".
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
hovertext: string or array of strings
ids: data array
insidetextfont:
  color: color or array of colors
  family: string or array of strings
  size: number or array of numbers greater than or equal to 1
labels: data array
legendgrouptitle:
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  text: string
legendrank: number
legendwidth: number greater than or equal to 0
level: number or categorical coordinate string
marker:
  autocolorscale: boolean
  cauto: boolean
  cmax: number
  cmid: number
  cmin: number
  coloraxis: subplotid
  colorbar:
    bgcolor: color
    bordercolor: color
    borderwidth: number greater than or equal to 0
    dtick: number or categorical coordinate string
    exponentformat: enumerated , one of ( "none" | "e" | "e" | "power" | "si" | "b"
      )
    len: number greater than or equal to 0
    lenmode: enumerated , one of ( "fraction" | "pixels" )
    minexponent: number greater than or equal to 0
    nticks: integer greater than or equal to 0
    orientation: enumerated , one of ( "h" | "v" )
    outlinecolor: color
    outlinewidth: number greater than or equal to 0
    separatethousands: boolean
    showexponent: enumerated , one of ( "all" | "first" | "last" | "none" )
    showticklabels: boolean
    showtickprefix: enumerated , one of ( "all" | "first" | "last" | "none" )
    showticksuffix: enumerated , one of ( "all" | "first" | "last" | "none" )
    thickness: number greater than or equal to 0
    thicknessmode: enumerated , one of ( "fraction" | "pixels" )
    tick0: number or categorical coordinate string
    tickangle: angle
    tickcolor: color
    tickfont:
      color: color
      family: string
      size: number greater than or equal to 1
    tickformat: string
    tickformatstops:
      dtickrange: array
      enabled: boolean
      name: string
      templateitemname: string
      value: string
    ticklabeloverflow: enumerated , one of ( "allow" | "hide past div" | "hide past
      domain" )
    ticklabelposition: enumerated , one of ( "outside" | "inside" | "outside top"
      | "inside top" | "outside left" | "inside left" | "outside right" | "inside
      right" | "outside bottom" | "inside bottom" )
    ticklabelstep: integer greater than or equal to 1
    ticklen: number greater than or equal to 0
    tickmode: enumerated , one of ( "auto" | "linear" | "array" )
    tickprefix: string
    ticks: enumerated , one of ( "outside" | "inside" | "" )
    ticksuffix: string
    ticktext: data array
    tickvals: data array
    tickwidth: number greater than or equal to 0
    title:
      font:
        color: color
        family: string
        size: number greater than or equal to 1
      side: enumerated , one of ( "right" | "top" | "bottom" )
      text: string
    x: number between or equal to -2 and 3
    xanchor: enumerated , one of ( "left" | "center" | "right" )
    xpad: number greater than or equal to 0
    y: number between or equal to -2 and 3
    yanchor: enumerated , one of ( "top" | "middle" | "bottom" )
    ypad: number greater than or equal to 0
  colors: data array
  colorscale: colorscale
  depthfade: enumerated , one of ( true | false | "reversed" )
  line:
    color: color or array of colors
    width: number or array of numbers greater than or equal to 0
  pad:
    b: number greater than or equal to 0
    l: number greater than or equal to 0
    r: number greater than or equal to 0
    t: number greater than or equal to 0
  reversescale: boolean
  showscale: boolean
maxdepth: integer
meta: number or categorical coordinate string
opacity: number between or equal to 0 and 1
outsidetextfont:
  color: color or array of colors
  family: string or array of strings
  size: number or array of numbers greater than or equal to 1
parents: data array
pathbar:
  edgeshape: enumerated , one of ( "&gt;" | "&lt;" | "|" | "/" | "" )
  side: enumerated , one of ( "top" | "bottom" )
  textfont:
    color: color or array of colors
    family: string or array of strings
    size: number or array of numbers greater than or equal to 1
  thickness: number greater than or equal to 12
  visible: boolean
root:
  color: color
sort: boolean
text: data array
textfont:
  color: color or array of colors
  family: string or array of strings
  size: number or array of numbers greater than or equal to 1
textinfo: flaglist string. any combination of "label", "text", "value", "current path",
  "percent root", "percent entry", "percent parent" joined with a "+" or "none".
textposition: enumerated , one of ( "top left" | "top center" | "top right" | "middle
  left" | "middle center" | "middle right" | "bottom left" | "bottom center" | "bottom
  right" )
texttemplate: string or array of strings
tiling:
  flip: flaglist string. any combination of "x", "y" joined with a "+"
  packing: enumerated , one of ( "squarify" | "binary" | "dice" | "slice" | "slice-dice"
    | "dice-slice" )
  pad: number greater than or equal to 0
  squarifyratio: number greater than or equal to 1
type: treemap
uirevision: number or categorical coordinate string
values: data array
visible: enumerated , one of ( true | false | "legendonly" )

```