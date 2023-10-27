```
a: data array
b: data array
carpet: string
connectgaps: boolean
customdata: data array
fill: enumerated , one of ( "none" | "toself" | "tonext" )
fillcolor: color
hoverinfo: flaglist string. any combination of "a", "b", "text", "name" joined with
  a "+" or "all" or "none" or "skip".
hoverlabel:
  align: enumerated or array of enumerateds , one of ( "left" | "right" | "auto" )
  bgcolor: color or array of colors
  bordercolor: color or array of colors
  font:
    color: color or array of colors
    family: string or array of strings
    size: number or array of numbers greater than or equal to 1
  namelength: integer or array of integers greater than or equal to -1
hoveron: flaglist string. any combination of "points", "fills" joined with a "+"
hovertemplate: string or array of strings
hovertext: string or array of strings
ids: data array
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
  backoff: number or array of numbers greater than or equal to 0
  color: color
  dash: string
  shape: enumerated , one of ( "linear" | "spline" )
  smoothing: number between or equal to 0 and 1.3
  width: number greater than or equal to 0
marker:
  angle: angle
  angleref: enumerated , one of ( "previous" | "up" )
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
  gradient:
    color: color or array of colors
    type: enumerated or array of enumerateds , one of ( "radial" | "horizontal" |
      "vertical" | "none" )
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
  maxdisplayed: number greater than or equal to 0
  opacity: number or array of numbers between or equal to 0 and 1
  reversescale: boolean
  showscale: boolean
  size: number or array of numbers greater than or equal to 0
  sizemin: number greater than or equal to 0
  sizemode: enumerated , one of ( "diameter" | "area" )
  sizeref: number
  standoff: number or array of numbers greater than or equal to 0
  symbol: enumerated or array of enumerateds , one of ( "0" | "0" | "circle" | "100"
    | "100" | "circle-open" | "200" | "200" | "circle-dot" | "300" | "300" | "circle-open-dot"
    | "1" | "1" | "square" | "101" | "101" | "square-open" | "201" | "201" | "square-dot"
    | "301" | "301" | "square-open-dot" | "2" | "2" | "diamond" | "102" | "102" |
    "diamond-open" | "202" | "202" | "diamond-dot" | "302" | "302" | "diamond-open-dot"
    | "3" | "3" | "cross" | "103" | "103" | "cross-open" | "203" | "203" | "cross-dot"
    | "303" | "303" | "cross-open-dot" | "4" | "4" | "x" | "104" | "104" | "x-open"
    | "204" | "204" | "x-dot" | "304" | "304" | "x-open-dot" | "5" | "5" | "triangle-up"
    | "105" | "105" | "triangle-up-open" | "205" | "205" | "triangle-up-dot" | "305"
    | "305" | "triangle-up-open-dot" | "6" | "6" | "triangle-down" | "106" | "106"
    | "triangle-down-open" | "206" | "206" | "triangle-down-dot" | "306" | "306" |
    "triangle-down-open-dot" | "7" | "7" | "triangle-left" | "107" | "107" | "triangle-left-open"
    | "207" | "207" | "triangle-left-dot" | "307" | "307" | "triangle-left-open-dot"
    | "8" | "8" | "triangle-right" | "108" | "108" | "triangle-right-open" | "208"
    | "208" | "triangle-right-dot" | "308" | "308" | "triangle-right-open-dot" | "9"
    | "9" | "triangle-ne" | "109" | "109" | "triangle-ne-open" | "209" | "209" | "triangle-ne-dot"
    | "309" | "309" | "triangle-ne-open-dot" | "10" | "10" | "triangle-se" | "110"
    | "110" | "triangle-se-open" | "210" | "210" | "triangle-se-dot" | "310" | "310"
    | "triangle-se-open-dot" | "11" | "11" | "triangle-sw" | "111" | "111" | "triangle-sw-open"
    | "211" | "211" | "triangle-sw-dot" | "311" | "311" | "triangle-sw-open-dot" |
    "12" | "12" | "triangle-nw" | "112" | "112" | "triangle-nw-open" | "212" | "212"
    | "triangle-nw-dot" | "312" | "312" | "triangle-nw-open-dot" | "13" | "13" | "pentagon"
    | "113" | "113" | "pentagon-open" | "213" | "213" | "pentagon-dot" | "313" | "313"
    | "pentagon-open-dot" | "14" | "14" | "hexagon" | "114" | "114" | "hexagon-open"
    | "214" | "214" | "hexagon-dot" | "314" | "314" | "hexagon-open-dot" | "15" |
    "15" | "hexagon2" | "115" | "115" | "hexagon2-open" | "215" | "215" | "hexagon2-dot"
    | "315" | "315" | "hexagon2-open-dot" | "16" | "16" | "octagon" | "116" | "116"
    | "octagon-open" | "216" | "216" | "octagon-dot" | "316" | "316" | "octagon-open-dot"
    | "17" | "17" | "star" | "117" | "117" | "star-open" | "217" | "217" | "star-dot"
    | "317" | "317" | "star-open-dot" | "18" | "18" | "hexagram" | "118" | "118" |
    "hexagram-open" | "218" | "218" | "hexagram-dot" | "318" | "318" | "hexagram-open-dot"
    | "19" | "19" | "star-triangle-up" | "119" | "119" | "star-triangle-up-open" |
    "219" | "219" | "star-triangle-up-dot" | "319" | "319" | "star-triangle-up-open-dot"
    | "20" | "20" | "star-triangle-down" | "120" | "120" | "star-triangle-down-open"
    | "220" | "220" | "star-triangle-down-dot" | "320" | "320" | "star-triangle-down-open-dot"
    | "21" | "21" | "star-square" | "121" | "121" | "star-square-open" | "221" | "221"
    | "star-square-dot" | "321" | "321" | "star-square-open-dot" | "22" | "22" | "star-diamond"
    | "122" | "122" | "star-diamond-open" | "222" | "222" | "star-diamond-dot" | "322"
    | "322" | "star-diamond-open-dot" | "23" | "23" | "diamond-tall" | "123" | "123"
    | "diamond-tall-open" | "223" | "223" | "diamond-tall-dot" | "323" | "323" | "diamond-tall-open-dot"
    | "24" | "24" | "diamond-wide" | "124" | "124" | "diamond-wide-open" | "224" |
    "224" | "diamond-wide-dot" | "324" | "324" | "diamond-wide-open-dot" | "25" |
    "25" | "hourglass" | "125" | "125" | "hourglass-open" | "26" | "26" | "bowtie"
    | "126" | "126" | "bowtie-open" | "27" | "27" | "circle-cross" | "127" | "127"
    | "circle-cross-open" | "28" | "28" | "circle-x" | "128" | "128" | "circle-x-open"
    | "29" | "29" | "square-cross" | "129" | "129" | "square-cross-open" | "30" |
    "30" | "square-x" | "130" | "130" | "square-x-open" | "31" | "31" | "diamond-cross"
    | "131" | "131" | "diamond-cross-open" | "32" | "32" | "diamond-x" | "132" | "132"
    | "diamond-x-open" | "33" | "33" | "cross-thin" | "133" | "133" | "cross-thin-open"
    | "34" | "34" | "x-thin" | "134" | "134" | "x-thin-open" | "35" | "35" | "asterisk"
    | "135" | "135" | "asterisk-open" | "36" | "36" | "hash" | "136" | "136" | "hash-open"
    | "236" | "236" | "hash-dot" | "336" | "336" | "hash-open-dot" | "37" | "37" |
    "y-up" | "137" | "137" | "y-up-open" | "38" | "38" | "y-down" | "138" | "138"
    | "y-down-open" | "39" | "39" | "y-left" | "139" | "139" | "y-left-open" | "40"
    | "40" | "y-right" | "140" | "140" | "y-right-open" | "41" | "41" | "line-ew"
    | "141" | "141" | "line-ew-open" | "42" | "42" | "line-ns" | "142" | "142" | "line-ns-open"
    | "43" | "43" | "line-ne" | "143" | "143" | "line-ne-open" | "44" | "44" | "line-nw"
    | "144" | "144" | "line-nw-open" | "45" | "45" | "arrow-up" | "145" | "145" |
    "arrow-up-open" | "46" | "46" | "arrow-down" | "146" | "146" | "arrow-down-open"
    | "47" | "47" | "arrow-left" | "147" | "147" | "arrow-left-open" | "48" | "48"
    | "arrow-right" | "148" | "148" | "arrow-right-open" | "49" | "49" | "arrow-bar-up"
    | "149" | "149" | "arrow-bar-up-open" | "50" | "50" | "arrow-bar-down" | "150"
    | "150" | "arrow-bar-down-open" | "51" | "51" | "arrow-bar-left" | "151" | "151"
    | "arrow-bar-left-open" | "52" | "52" | "arrow-bar-right" | "152" | "152" | "arrow-bar-right-open"
    | "53" | "53" | "arrow" | "153" | "153" | "arrow-open" | "54" | "54" | "arrow-wide"
    | "154" | "154" | "arrow-wide-open" )
meta: number or categorical coordinate string
mode: flaglist string. any combination of "lines", "markers", "text" joined with a
  "+" or "none".
opacity: number between or equal to 0 and 1
selected:
  marker:
    color: color
    opacity: number between or equal to 0 and 1
    size: number greater than or equal to 0
  textfont:
    color: color
selectedpoints: number or categorical coordinate string
showlegend: boolean
text: string or array of strings
textfont:
  color: color or array of colors
  family: string or array of strings
  size: number or array of numbers greater than or equal to 1
textposition: enumerated or array of enumerateds , one of ( "top left" | "top center"
  | "top right" | "middle left" | "middle center" | "middle right" | "bottom left"
  | "bottom center" | "bottom right" )
texttemplate: string or array of strings
type: scattercarpet
uirevision: number or categorical coordinate string
unselected:
  marker:
    color: color
    opacity: number between or equal to 0 and 1
    size: number greater than or equal to 0
  textfont:
    color: color
visible: enumerated , one of ( true | false | "legendonly" )
xaxis: subplotid
yaxis: subplotid

```