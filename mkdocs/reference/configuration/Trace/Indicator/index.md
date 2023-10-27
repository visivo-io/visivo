```
align: enumerated , one of ( "left" | "center" | "right" )
customdata: data array
delta:
  decreasing:
    color: color
    symbol: string
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  increasing:
    color: color
    symbol: string
  position: enumerated , one of ( "top" | "bottom" | "left" | "right" )
  prefix: string
  reference: number
  relative: boolean
  suffix: string
  valueformat: string
domain:
  column: integer greater than or equal to 0
  row: integer greater than or equal to 0
  x: array
  y: array
gauge:
  axis:
    dtick: number or categorical coordinate string
    exponentformat: enumerated , one of ( "none" | "e" | "e" | "power" | "si" | "b"
      )
    minexponent: number greater than or equal to 0
    nticks: integer greater than or equal to 0
    range: array
    separatethousands: boolean
    showexponent: enumerated , one of ( "all" | "first" | "last" | "none" )
    showticklabels: boolean
    showtickprefix: enumerated , one of ( "all" | "first" | "last" | "none" )
    showticksuffix: enumerated , one of ( "all" | "first" | "last" | "none" )
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
    ticklabelstep: integer greater than or equal to 1
    ticklen: number greater than or equal to 0
    tickmode: enumerated , one of ( "auto" | "linear" | "array" )
    tickprefix: string
    ticks: enumerated , one of ( "outside" | "inside" | "" )
    ticksuffix: string
    ticktext: data array
    tickvals: data array
    tickwidth: number greater than or equal to 0
    visible: boolean
  bar:
    color: color
    line:
      color: color
      width: number greater than or equal to 0
    thickness: number between or equal to 0 and 1
  bgcolor: color
  bordercolor: color
  borderwidth: number greater than or equal to 0
  shape: enumerated , one of ( "angular" | "bullet" )
  steps:
    color: color
    line:
      color: color
      width: number greater than or equal to 0
    name: string
    range: array
    templateitemname: string
    thickness: number between or equal to 0 and 1
  threshold:
    line:
      color: color
      width: number greater than or equal to 0
    thickness: number between or equal to 0 and 1
    value: number
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
mode: flaglist string. any combination of "number", "delta", "gauge" joined with a
  "+"
number:
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  prefix: string
  suffix: string
  valueformat: string
title:
  align: enumerated , one of ( "left" | "center" | "right" )
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  text: string
type: indicator
uirevision: number or categorical coordinate string
value: number
visible: enumerated , one of ( true | false | "legendonly" )

```