---
search:
  exclude: true
---
<!--start-->
## Overview

The `choroplethmap` trace type is used to create choropleth maps on top of a MapLibre layer. It's a more advanced form of the standard `choropleth` trace, allowing for greater control over map projections, interactivity, and advanced map features like zooming and tilting.

With `choroplethmap`, you can visualize data across geographic regions on MapLibre maps, and customize the map's appearance using layers, color scales, and hover labels.

!!! tip "Common Uses"

    - **Geospatial Data Visualization**: Displaying data on an interactive MapLibre map.
    - **Thematic Mapping with Interactivity**: Creating maps that can zoom, tilt, and rotate while visualizing variables like population or economic metrics.
    - **Map Projections**: Applying various MapLibre projections for advanced geographical data representation.

_**Check out the [Attributes](../configuration/Trace/Props/Choroplethmap/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple ChoroplethMapLibre Map"

        Here's a simple `choroplethmap` map showing population density across different regions on a MapLibre layer:


        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: country-population-data-map
            args:
              - echo
              - |
                iso_alpha,population_density
                USA,36
                CAN,4
                RUS,9
                CHN,153
                IND,450
        traces:
          - name: Simple ChoroplethMapLibre Map
            model: ref(country-population-data-map
            props:
              type: choroplethmap
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ?{iso_alpha}
              z: ?{population_density}
              colorscale: "Blues"
              marker:
                opacity: 0.7
        charts:
          - name: Simple ChoroplethMapLibre Chart
            traces:
              - ${ref(Simple ChoroplethMapLibre Map)}
            layout:
              title:
                text: Population Density by Country on MapLibre<br><sub>Data in Persons per Square Kilometer</sub>
              mapbox:
                style: "carto-positron"
                zoom: 1
                center:
                  lat: 20
                  lon: 0
        ```

    === "ChoroplethMapLibre with Custom Colorscale and Zoom"

        This example shows a choropleth map on a MapLibre layer using a custom color scale, zoom, and center on Europe:


        Here's the code:

        ```yaml
        models:
          - name: european-gdp-data
            args:
              - echo
              - |
                iso_alpha,gdp
                FRA,2716
                DEU,3846
                ITA,2001
                ESP,1419
                GBR,2827
        traces:
          - name: ChoroplethMapLibre with Custom Colorscale Trace
            model: ${ref(european-gdp-data)}
            props:
              type: choroplethmap
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ?{iso_alpha}
              z: ?{gdp}
              colorscale: [[0, "rgb(255,245,240)"], [0.5, "rgb(252,146,114)"], [1, "rgb(165,15,21)"]]
              marker:
                opacity: 0.75
        charts:
          - name: ChoroplethMapLibre with Custom Colorscale
            traces:
              - ${ref(ChoroplethMapLibre with Custom Colorscale Trace)}
            layout:
              title:
                text: GDP by Country in Europe<br><sub>Data in Billions of USD</sub>
              mapbox:
                style: "carto-positron"
                zoom: 3
                center:
                  lat: 50
                  lon: 10
        ```

    === "Interactive ChoroplethMapLibre with Hover Data"

        Here's a choropleth map on a MapLibre layer that includes hover information for each country:


        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: covid-data-map
            args:
              - echo
              - |
                iso_alpha,covid_cases,covid_deaths
                USA,33000000,600000
                BRA,20000000,550000
                IND,30000000,400000
                RUS,6000000,150000
                ZAF,2000000,60000
        traces:
          - name: Interactive ChoroplethMapLibre with Hover Data Trace
            model: ${ref(covid-data-map)}
            props:
              type: choroplethmap
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ?{iso_alpha}
              z: ?{covid_cases}
              colorscale: "Reds"
              text: ?{covid_deaths}
              hovertemplate: "Cases: %{z}<br>Deaths: %{text}"
              marker:
                opacity: 0.8
        charts:
          - name: Interactive ChoroplethMapLibre with Hover Data
            traces:
              - ${ref(Interactive ChoroplethMapLibre with Hover Data Trace)}
            layout:
              title:
                text: COVID-19 Cases by Country on MapLibre<br><sub>Hover to See Deaths Data</sub>
              mapbox:
                style: "carto-darkmatter"
                zoom: 2
                center:
                  lat: 30
                  lon: 0
        ```

{% endraw %}
<!--end-->