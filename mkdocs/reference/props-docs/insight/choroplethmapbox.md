---
search:
  exclude: true
---

<!--start-->

## Overview

!!! danger

    You need a mapbox api key to use choroplethmapbox traces.

The `choroplethmapbox` trace type is used to create choropleth maps on top of a Mapbox layer. It's a more advanced form of the standard `choropleth` trace, allowing for greater control over map projections, interactivity, and advanced map features like zooming and tilting.

With `choroplethmapbox`, you can visualize data across geographic regions on Mapbox maps, and customize the map's appearance using layers, color scales, and hover labels.

!!! tip "Common Uses"

    - **Geospatial Data Visualization**: Displaying data on an interactive Mapbox map.
    - **Thematic Mapping with Interactivity**: Creating maps that can zoom, tilt, and rotate while visualizing variables like population or economic metrics.
    - **Map Projections**: Applying various Mapbox projections for advanced geographical data representation.

_**Check out the [Attributes](../configuration/Insight/Props/Choroplethmapbox/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple ChoroplethMapbox Map"

        Here's a simple `choroplethmapbox` map showing population density across different regions on a Mapbox layer:

        ```yaml
        models:
          - name: country-population-data-mapbox
            args:
              - echo
              - |
                iso_alpha,population_density
                USA,36
                CAN,4
                RUS,9
                CHN,153
                IND,450
        insights:
          - name: Simple ChoroplethMapbox Map
            model: ${ref(country-population-data-mapbox)}
            columns:
              iso_alpha: ?{iso_alpha}
              population_density: ?{population_density}
            props:
              type: choroplethmapbox
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ${columns.iso_alpha}
              z: ${columns.population_density}
              colorscale: "Blues"
              marker:
                opacity: 0.7
        charts:
          - name: Simple ChoroplethMapbox Chart
            insights:
              - ${ref(Simple ChoroplethMapbox Map)}
            layout:
              title:
                text: Population Density by Country on Mapbox<br><sub>Data in Persons per Square Kilometer</sub>
              mapbox:
                style: "carto-positron"
                zoom: 1
                center:
                  lat: 20
                  lon: 0
        ```

    === "ChoroplethMapbox with Custom Colorscale and Zoom"

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
        insights:
          - name: ChoroplethMapbox with Custom Colorscale
            model: ${ref(european-gdp-data)}
            columns:
              iso_alpha: ?{iso_alpha}
              gdp: ?{gdp}
            props:
              type: choroplethmapbox
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ${columns.iso_alpha}
              z: ${columns.gdp}
              colorscale: [[0, "rgb(255,245,240)"], [0.5, "rgb(252,146,114)"], [1, "rgb(165,15,21)"]]
              marker:
                opacity: 0.75
        charts:
          - name: ChoroplethMapbox with Custom Colorscale Chart
            insights:
              - ${ref(ChoroplethMapbox with Custom Colorscale)}
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

    === "Interactive ChoroplethMapbox with Hover Data"

        ```yaml
        models:
          - name: covid-data-mapbox
            args:
              - echo
              - |
                iso_alpha,covid_cases,covid_deaths
                USA,33000000,600000
                BRA,20000000,550000
                IND,30000000,400000
                RUS,6000000,150000
                ZAF,2000000,60000
        insights:
          - name: Interactive ChoroplethMapbox with Hover Data
            model: ${ref(covid-data-mapbox)}
            columns:
              iso_alpha: ?{iso_alpha}
              covid_cases: ?{covid_cases}
              covid_deaths: ?{covid_deaths}
            props:
              type: choroplethmapbox
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ${columns.iso_alpha}
              z: ${columns.covid_cases}
              colorscale: "Reds"
              text: ${columns.covid_deaths}
              hovertemplate: "Cases: %{z}<br>Deaths: %{text}"
              marker:
                opacity: 0.8
        charts:
          - name: Interactive ChoroplethMapbox with Hover Data Chart
            insights:
              - ${ref(Interactive ChoroplethMapbox with Hover Data)}
            layout:
              title:
                text: COVID-19 Cases by Country on Mapbox<br><sub>Hover to See Deaths Data</sub>
              mapbox:
                style: "carto-darkmatter"
                zoom: 2
                center:
                  lat: 30
                  lon: 0
        ```

{% endraw %}

<!--end-->
