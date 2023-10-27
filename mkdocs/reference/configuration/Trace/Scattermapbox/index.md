```
below: string
cluster:
  color: color or array of colors
  enabled: boolean
  maxzoom: number between or equal to 0 and 24
  opacity: number or array of numbers between or equal to 0 and 1
  size: number or array of numbers greater than or equal to 0
  step: number or array of numbers greater than or equal to -1
connectgaps: boolean
customdata: data array
fill: enumerated , one of ( "none" | "toself" )
fillcolor: color
hoverinfo: flaglist string. any combination of "lon", "lat", "text", "name" joined
  with a "+" or "all" or "none" or "skip".
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
lat: data array
legendgroup: string
legendgrouptitle:
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  text: string
legendrank: number
legendwidth: number greater than or equal to 0
line:
  color: color
  width: number greater than or equal to 0
lon: data array
marker:
  allowoverlap: boolean
  angle: number or array of numbers
  autocolorscale: boolean
  cauto: boolean
  cmax: number
  cmid: number
  cmin: number
  color: color or array of colors
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
  colorscale: colorscale
  opacity: number or array of numbers between or equal to 0 and 1
  reversescale: boolean
  showscale: boolean
  size: number or array of numbers greater than or equal to 0
  sizemin: number greater than or equal to 0
  sizemode: enumerated , one of ( "diameter" | "area" )
  sizeref: number
  symbol: string or array of strings
meta: number or categorical coordinate string
mode: flaglist string. any combination of "lines", "markers", "text" joined with a
  "+" or "none".
opacity: number between or equal to 0 and 1
selected:
  marker:
    color: color
    opacity: number between or equal to 0 and 1
    size: number greater than or equal to 0
selectedpoints: number or categorical coordinate string
showlegend: boolean
subplot: subplotid
text: string or array of strings
textfont:
  color: color
  family: string
  size: number greater than or equal to 1
textposition: enumerated , one of ( "top left" | "top center" | "top right" | "middle
  left" | "middle center" | "middle right" | "bottom left" | "bottom center" | "bottom
  right" )
texttemplate: string or array of strings
type: scattermapbox
uirevision: number or categorical coordinate string
unselected:
  marker:
    color: color
    opacity: number between or equal to 0 and 1
    size: number greater than or equal to 0
visible: enumerated , one of ( true | false | "legendonly" )

```