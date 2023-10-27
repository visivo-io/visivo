```
arrangement: enumerated , one of ( "snap" | "perpendicular" | "freeform" | "fixed"
  )
customdata: data array
domain:
  column: integer greater than or equal to 0
  row: integer greater than or equal to 0
  x: array
  y: array
hoverinfo: flaglist string. any combination of joined with a "+" or "all" or "none"
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
ids: data array
legendgrouptitle:
  font:
    color: color
    family: string
    size: number greater than or equal to 1
  text: string
legendrank: number
legendwidth: number greater than or equal to 0
link:
  arrowlen: number greater than or equal to 0
  color: color or array of colors
  colorscales:
    cmax: number
    cmin: number
    colorscale: colorscale
    label: string
    name: string
    templateitemname: string
  customdata: data array
  hoverinfo: enumerated , one of ( "all" | "none" | "skip" )
  hoverlabel:
    align: enumerated or array of enumerateds , one of ( "left" | "right" | "auto"
      )
    bgcolor: color or array of colors
    bordercolor: color or array of colors
    font:
      color: color or array of colors
      family: string or array of strings
      size: number or array of numbers greater than or equal to 1
    namelength: integer or array of integers greater than or equal to -1
  hovertemplate: string or array of strings
  label: data array
  line:
    color: color or array of colors
    width: number or array of numbers greater than or equal to 0
  source: data array
  target: data array
  value: data array
meta: number or categorical coordinate string
node:
  color: color or array of colors
  customdata: data array
  groups: array
  hoverinfo: enumerated , one of ( "all" | "none" | "skip" )
  hoverlabel:
    align: enumerated or array of enumerateds , one of ( "left" | "right" | "auto"
      )
    bgcolor: color or array of colors
    bordercolor: color or array of colors
    font:
      color: color or array of colors
      family: string or array of strings
      size: number or array of numbers greater than or equal to 1
    namelength: integer or array of integers greater than or equal to -1
  hovertemplate: string or array of strings
  label: data array
  line:
    color: color or array of colors
    width: number or array of numbers greater than or equal to 0
  pad: number greater than or equal to 0
  thickness: number greater than or equal to 1
  x: data array
  y: data array
orientation: enumerated , one of ( "v" | "h" )
selectedpoints: number or categorical coordinate string
textfont:
  color: color
  family: string
  size: number greater than or equal to 1
type: sankey
uirevision: number or categorical coordinate string
valueformat: string
valuesuffix: string
visible: enumerated , one of ( true | false | "legendonly" )

```