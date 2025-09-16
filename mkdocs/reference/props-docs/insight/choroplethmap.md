---
search:
  exclude: true
---

<!--start-->

## Overview

The `choroplethmap` insight is used to create choropleth maps on top of a MapLibre layer. It's a more advanced form of the standard `choropleth` insight, allowing for greater control over map projections, interactivity, and advanced map features like zooming and tilting.

With `choroplethmap`, you can visualize data across geographic regions on MapLibre maps, and customize the map's appearance using layers, color scales, and hover labels.

!!! tip "Common Uses"

    - **Geospatial Data Visualization**: Displaying data on an interactive MapLibre map.
    - **Thematic Mapping with Interactivity**: Creating maps that can zoom, tilt, and rotate while visualizing variables like population or economic metrics.
    - **Map Projections**: Applying various MapLibre projections for advanced geographical data representation.

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple ChoroplethMapLibre Map"

        Here's a simple `choroplethmap` showing population density across different regions on a MapLibre layer:

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
        insights:
          - name: Simple ChoroplethMapLibre Map
            model: ${ref(country-population-data-map)}
            columns:
              iso_alpha: ?{iso_alpha}
              population_density: ?{population_density}
            props:
              type: choroplethmap
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ?{columns.iso_alpha}
              z: ?{columns.population_density}
              colorscale: "Blues"
              marker:
                opacity: 0.7
        charts:
          - name: Simple ChoroplethMapLibre Chart
            insights:
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
          - name: ChoroplethMapLibre with Custom Colorscale
            model: ${ref(european-gdp-data)}
            columns:
              iso_alpha: ?{iso_alpha}
              gdp: ?{gdp}
            props:
              type: choroplethmap
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ?{columns.iso_alpha}
              z: ?{columns.gdp}
              colorscale: [[0, "rgb(255,245,240)"], [0.5, "rgb(252,146,114)"], [1, "rgb(165,15,21)"]]
              marker:
                opacity: 0.75
        charts:
          - name: ChoroplethMapLibre with Custom Colorscale
            insights:
              - ${ref(ChoroplethMapLibre with Custom Colorscale)}
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
        insights:
          - name: Interactive ChoroplethMapLibre with Hover Data
            model: ${ref(covid-data-map)}
            columns:
              iso_alpha: ?{iso_alpha}
              covid_cases: ?{covid_cases}
              covid_deaths: ?{covid_deaths}
            props:
              type: choroplethmap
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: ?{columns.iso_alpha}
              z: ?{columns.covid_cases}
              text: ?{columns.covid_deaths}
              hovertemplate: "Cases: %{z}<br>Deaths: %{text}"
              colorscale: "Reds"
              marker:
                opacity: 0.8
        charts:
          - name: Interactive ChoroplethMapLibre with Hover Data
            insights:
              - ${ref(Interactive ChoroplethMapLibre with Hover Data)}
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
