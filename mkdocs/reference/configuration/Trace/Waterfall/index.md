```
alignmentgroup: string
base: number
cliponaxis: boolean
connector:
  line:
    color: color
    dash: string
    width: number greater than or equal to 0
  mode: enumerated , one of ( "spanning" | "between" )
  visible: boolean
constraintext: enumerated , one of ( "inside" | "outside" | "both" | "none" )
customdata: data array
decreasing:
  marker:
    color: color
    line:
      color: color
      width: number greater than or equal to 0
dx: number
dy: number
hoverinfo: flaglist string. any combination of "name", "x", "y", "text", "initial",
  "delta", "final" joined with a "+" or "all" or "none" or "skip".
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
increasing:
  marker:
    color: color
    line:
      color: color
      width: number greater than or equal to 0
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
measure: data array
meta: number or categorical coordinate string
offset: number or array of numbers
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
textinfo: flaglist string. any combination of "label", "text", "initial", "delta",
  "final" joined with a "+" or "none".
textposition: enumerated or array of enumerateds , one of ( "inside" | "outside" |
  "auto" | "none" )
texttemplate: string or array of strings
totals:
  marker:
    color: color
    line:
      color: color
      width: number greater than or equal to 0
type: waterfall
uirevision: number or categorical coordinate string
visible: enumerated , one of ( true | false | "legendonly" )
width: number or array of numbers greater than or equal to 0
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