
## Overview

The `choroplethmapbox` trace type is used to create choropleth maps on top of a Mapbox layer. It’s a more advanced form of the standard `choropleth` trace, allowing for greater control over map projections, interactivity, and advanced map features like zooming and tilting.

With `choroplethmapbox`, you can visualize data across geographic regions on Mapbox maps, and customize the map's appearance using layers, color scales, and hover labels.

!!! tip "Common Uses"

    - **Geospatial Data Visualization**: Displaying data on an interactive Mapbox map.
    - **Thematic Mapping with Interactivity**: Creating maps that can zoom, tilt, and rotate while visualizing variables like population or economic metrics.
    - **Map Projections**: Applying various Mapbox projections for advanced geographical data representation.

_**Check out the [Attributes](../configuration/Trace/Props/ChoroplethMapbox/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple ChoroplethMapbox Map"

        Here's a simple `choroplethmapbox` map showing population density across different regions on a Mapbox layer:

        ![](../../assets/example-charts/props/choroplethmapbox/simple-choroplethmapbox.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: country-population-data
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
          - name: Simple ChoroplethMapbox Map
            model: ref(country-population-data)
            props:
              type: choroplethmapbox
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: query(iso_alpha)
              z: query(population_density)
              colorscale: "Blues"
              marker:
                opacity: 0.7
        charts:
          - name: Simple ChoroplethMapbox Chart
            traces:
              - ref(Simple ChoroplethMapbox Map)
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

        This example shows a choropleth map on a Mapbox layer using a custom color scale, zoom, and center on Europe:

        ![](../../assets/example-charts/props/choroplethmapbox/custom-colorscale-choroplethmapbox.png)

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
          - name: ChoroplethMapbox with Custom Colorscale
            model: ref(european-gdp-data)
            props:
              type: choroplethmapbox
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: query(iso_alpha)
              z: query(gdp)
              colorscale: [[0, "rgb(255,245,240)"], [0.5, "rgb(252,146,114)"], [1, "rgb(165,15,21)"]]
              marker:
                opacity: 0.75
        charts:
          - name: ChoroplethMapbox with Custom Colorscale
            traces:
              - ref(ChoroplethMapbox with Custom Colorscale)
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

        Here's a choropleth map on a Mapbox layer that includes hover information for each country:

        ![](../../assets/example-charts/props/choroplethmapbox/choroplethmapbox-hover.png)

        You can copy this code below to create this chart in your project:

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
        traces:
          - name: Interactive ChoroplethMapbox with Hover Data
            model: ref(covid-data-mapbox)
            props:
              type: choroplethmapbox
              geojson: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
              locations: query(iso_alpha)
              z: query(covid_cases)
              colorscale: "Reds"
              text: query(covid_deaths)
              hovertemplate: "Cases: %{z}<br>Deaths: %{text}"
              marker:
                opacity: 0.8
        charts:
          - name: Interactive ChoroplethMapbox with Hover Data
            traces:
              - ref(Interactive ChoroplethMapbox with Hover Data)
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
