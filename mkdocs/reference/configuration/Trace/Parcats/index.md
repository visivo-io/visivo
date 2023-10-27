```
arrangement: enumerated , one of ( "perpendicular" | "freeform" | "fixed" )
bundlecolors: boolean
counts: number or array of numbers greater than or equal to 0
dimensions:
  categoryarray: data array
  categoryorder: enumerated , one of ( "trace" | "category ascending" | "category
    descending" | "array" )
  displayindex: integer
  label: string
  ticktext: data array
  values: data array
  visible: boolean
domain:
  column: integer greater than or equal to 0
  row: integer greater than or equal to 0
  x: array
  y: array
hoverinfo: flaglist string. any combination of "count", "probability" joined with
  a "+" or "all" or "none" or "skip".
hoveron: enumerated , one of ( "category" | "color" | "dimension" )
hovertemplate: string
labelfont:
  color: color
  family: string
  size: number greater than or equal to 1
legendgrouptitle:
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  text: string
legendwidth: number greater than or equal to 0
line:
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
  hovertemplate: string
  reversescale: boolean
  shape: enumerated , one of ( "linear" | "hspline" )
  showscale: boolean
meta: number or categorical coordinate string
sortpaths: enumerated , one of ( "forward" | "backward" )
tickfont:
  color: color
  family: string
  size: number greater than or equal to 1
type: parcats
uirevision: number or categorical coordinate string
visible: enumerated , one of ( true | false | "legendonly" )

```