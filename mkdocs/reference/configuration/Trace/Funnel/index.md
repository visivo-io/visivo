```
alignmentgroup: string
cliponaxis: boolean
connector:
  fillcolor: color
  line:
    color: color
    dash: string
    width: number greater than or equal to 0
  visible: boolean
constraintext: enumerated , one of ( "inside" | "outside" | "both" | "none" )
customdata: data array
dx: number
dy: number
hoverinfo: flaglist string. any combination of "name", "x", "y", "text", "percent
  initial", "percent previous", "percent total" joined with a "+" or "all" or "none"
  or "skip".
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
insidetextanchor: enumerated , one of ( "end" | "middle" | "start" )
insidetextfont:
  color: color or array of colors
  family: string or array of strings
  size: number or array of numbers greater than or equal to 1
legendgroup: string
legendgrouptitle:
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  text: string
legendrank: number
legendwidth: number greater than or equal to 0
marker:
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
  line:
    autocolorscale: boolean
    cauto: boolean
    cmax: number
    cmid: number
    cmin: number
    color: color or array of colors
    coloraxis: subplotid
    colorscale: colorscale
    reversescale: boolean
    width: number or array of numbers greater than or equal to 0
  opacity: number or array of numbers between or equal to 0 and 1
  reversescale: boolean
  showscale: boolean
meta: number or categorical coordinate string
offset: number
offsetgroup: string
opacity: number between or equal to 0 and 1
orientation: enumerated , one of ( "v" | "h" )
outsidetextfont:
  color: color or array of colors
  family: string or array of strings
  size: number or array of numbers greater than or equal to 1
selectedpoints: number or categorical coordinate string
showlegend: boolean
text: string or array of strings
textangle: angle
textfont:
  color: color or array of colors
  family: string or array of strings
  size: number or array of numbers greater than or equal to 1
textinfo: flaglist string. any combination of "label", "text", "percent initial",
  "percent previous", "percent total", "value" joined with a "+" or "none".
textposition: enumerated or array of enumerateds , one of ( "inside" | "outside" |
  "auto" | "none" )
texttemplate: string or array of strings
type: funnel
uirevision: number or categorical coordinate string
visible: enumerated , one of ( true | false | "legendonly" )
width: number greater than or equal to 0
x: data array
x0: number or categorical coordinate string
xaxis: subplotid
xhoverformat: string
xperiod: number or categorical coordinate string
xperiod0: number or categorical coordinate string
xperiodalignment: enumerated , one of ( "start" | "middle" | "end" )
y: data array
y0: number or categorical coordinate string
yaxis: subplotid
yhoverformat: string
yperiod: number or categorical coordinate string
yperiod0: number or categorical coordinate string
yperiodalignment: enumerated , one of ( "start" | "middle" | "end" )

```