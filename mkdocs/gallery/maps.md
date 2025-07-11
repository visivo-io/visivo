# Geographic Maps

Geographic visualizations bring location-based data to life, revealing spatial patterns, regional differences, and geographic relationships. Visivo supports multiple map types for different analytical needs.

## When to Use Geographic Maps

- **Regional Analysis**: Compare metrics across countries, states, or regions
- **Location Data**: Plot points of interest, stores, or events
- **Density Mapping**: Show concentration of activities or values
- **Flow Visualization**: Display movement between locations

## Choropleth Maps

Color regions based on data values:

```yaml
name: geographic-analysis

sources:
  - name: geo_db
    type: duckdb
    database: ":memory:"

models:
  - name: country_metrics
    source_name: geo_db
    sql: |
      WITH countries AS (
        SELECT * FROM (VALUES
          ('USA', 'United States', 331.9, 65300),
          ('CHN', 'China', 1412.0, 12556),
          ('IND', 'India', 1380.0, 2277),
          ('BRA', 'Brazil', 213.0, 8897),
          ('RUS', 'Russia', 146.0, 12194),
          ('JPN', 'Japan', 125.8, 40193),
          ('DEU', 'Germany', 83.2, 50801),
          ('GBR', 'United Kingdom', 67.5, 47334),
          ('FRA', 'France', 67.4, 44995),
          ('ITA', 'Italy', 59.0, 35551),
          ('CAN', 'Canada', 38.2, 52051),
          ('AUS', 'Australia', 25.7, 59934),
          ('MEX', 'Mexico', 128.9, 10045),
          ('ZAF', 'South Africa', 59.3, 7055),
          ('EGY', 'Egypt', 102.3, 3698)
        ) AS t(iso_code, country_name, population_millions, gdp_per_capita)
      )
      SELECT 
        iso_code,
        country_name,
        population_millions,
        gdp_per_capita,
        population_millions * gdp_per_capita / 1000 as gdp_billions
      FROM countries

traces:
  - name: gdp_choropleth
    model: ${ref(country_metrics)}
    props:
      type: choropleth
      locations: ?{iso_code}
      z: ?{gdp_per_capita}
      text: ?{country_name}
      colorscale: "Blues"
      reversescale: false
      marker:
        line:
          color: "white"
          width: 0.5
      colorbar:
        title: "GDP per Capita ($)"
        tickformat: "$,.0f"
      hovertemplate: |
        <b>%{text}</b><br>
        GDP per Capita: $%{z:,.0f}<br>
        Population: %{customdata[0]:.1f}M<br>
        Total GDP: $%{customdata[1]:.0f}B<br>
        <extra></extra>
      customdata: ?{array[population_millions, gdp_billions]}
      
charts:
  - name: world_gdp_map
    traces:
      - ${ref(gdp_choropleth)}
    layout:
      title: "Global GDP per Capita"
      geo:
        projection:
          type: "natural earth"
        showland: true
        landcolor: "rgb(243, 243, 243)"
        coastlinecolor: "rgb(204, 204, 204)"
        showlakes: true
        lakecolor: "rgb(255, 255, 255)"
```

## US State Choropleth

Visualize data by US states:

```yaml
models:
  - name: state_unemployment
    source_name: geo_db
    sql: |
      WITH states AS (
        SELECT * FROM (VALUES
          ('AL', 'Alabama', 2.7),
          ('AK', 'Alaska', 4.5),
          ('AZ', 'Arizona', 3.5),
          ('AR', 'Arkansas', 3.3),
          ('CA', 'California', 4.2),
          ('CO', 'Colorado', 3.0),
          ('CT', 'Connecticut', 3.8),
          ('FL', 'Florida', 2.8),
          ('GA', 'Georgia', 2.9),
          ('TX', 'Texas', 3.7),
          ('NY', 'New York', 4.1),
          ('WA', 'Washington', 3.9)
          -- Add more states as needed
        ) AS t(state_code, state_name, unemployment_rate)
      )
      SELECT * FROM states

traces:
  - name: state_unemployment_map
    model: ${ref(state_unemployment)}
    props:
      type: choropleth
      locationmode: "USA-states"
      locations: ?{state_code}
      z: ?{unemployment_rate}
      text: ?{state_name}
      colorscale: "Reds"
      marker:
        line:
          color: "white"
          width: 2
      colorbar:
        title: "Unemployment %"
        tickformat: ".1f"
        
charts:
  - name: us_unemployment
    traces:
      - ${ref(state_unemployment_map)}
    layout:
      title: "US Unemployment Rate by State"
      geo:
        scope: "usa"
        projection:
          type: "albers usa"
        showlakes: true
        lakecolor: "rgb(255, 255, 255)"
```

## Scatter Maps

Plot points on a geographic map:

```yaml
models:
  - name: earthquake_data
    source_name: geo_db
    sql: |
      WITH earthquakes AS (
        SELECT 
          longitude,
          latitude,
          magnitude,
          depth_km,
          location_name,
          CASE 
            WHEN magnitude >= 7 THEN 'Major'
            WHEN magnitude >= 5 THEN 'Moderate'
            ELSE 'Minor'
          END as severity
        FROM (VALUES
          (-118.24, 34.05, 6.7, 17, 'Los Angeles'),
          (-122.42, 37.77, 5.1, 8, 'San Francisco'),
          (139.69, 35.68, 7.2, 25, 'Tokyo'),
          (-70.60, -33.45, 6.9, 35, 'Santiago'),
          (28.97, 41.01, 5.8, 10, 'Istanbul'),
          (106.84, -6.17, 6.5, 50, 'Jakarta'),
          (151.21, -33.86, 5.3, 15, 'Sydney')
        ) AS t(longitude, latitude, magnitude, depth_km, location_name)
      )
      SELECT * FROM earthquakes

traces:
  - name: earthquake_scatter
    model: ${ref(earthquake_data)}
    props:
      type: scattergeo
      lon: ?{longitude}
      lat: ?{latitude}
      text: ?{location_name || '<br>Magnitude: ' || magnitude}
      mode: "markers"
      marker:
        size: ?{magnitude * 3}
        color: ?{depth_km}
        colorscale: "Viridis"
        cmin: 0
        cmax: 60
        reversescale: true
        colorbar:
          title: "Depth (km)"
        line:
          color: "white"
          width: 1
      hovertemplate: |
        <b>%{text}</b><br>
        Depth: %{marker.color} km<br>
        <extra></extra>
```

## Density Maps

Show concentration of points:

```yaml
models:
  - name: store_locations
    source_name: geo_db
    sql: |
      WITH stores AS (
        -- Generate clustered store locations
        SELECT 
          -122.4 + (RANDOM() - 0.5) * 0.5 as lon,
          37.7 + (RANDOM() - 0.5) * 0.5 as lat,
          10000 + RANDOM() * 50000 as revenue
        FROM generate_series(1, 100)
        UNION ALL
        SELECT 
          -118.2 + (RANDOM() - 0.5) * 0.6 as lon,
          34.0 + (RANDOM() - 0.5) * 0.6 as lat,
          15000 + RANDOM() * 60000 as revenue
        FROM generate_series(1, 150)
        UNION ALL
        SELECT 
          -73.9 + (RANDOM() - 0.5) * 0.4 as lon,
          40.7 + (RANDOM() - 0.5) * 0.4 as lat,
          20000 + RANDOM() * 80000 as revenue
        FROM generate_series(1, 200)
      )
      SELECT lon, lat, ROUND(revenue) as revenue FROM stores

traces:
  - name: store_density
    model: ${ref(store_locations)}
    props:
      type: densitymapbox
      lon: ?{lon}
      lat: ?{lat}
      z: ?{revenue}
      radius: 30
      colorscale: "Hot"
      
charts:
  - name: store_heatmap
    traces:
      - ${ref(store_density)}
    layout:
      title: "Store Revenue Density"
      mapbox:
        style: "open-street-map"
        center:
          lon: -98
          lat: 39
        zoom: 3
```

## Line Maps

Show connections or flows:

```yaml
models:
  - name: flight_routes
    source_name: geo_db
    sql: |
      WITH routes AS (
        SELECT * FROM (VALUES
          ('New York', 40.71, -74.00, 'London', 51.51, -0.13, 847),
          ('New York', 40.71, -74.00, 'Tokyo', 35.68, 139.69, 342),
          ('London', 51.51, -0.13, 'Paris', 48.86, 2.35, 1250),
          ('London', 51.51, -0.13, 'Dubai', 25.27, 55.29, 573),
          ('Tokyo', 35.68, 139.69, 'Sydney', -33.86, 151.21, 445),
          ('Dubai', 25.27, 55.29, 'Singapore', 1.35, 103.82, 621)
        ) AS t(origin_city, origin_lat, origin_lon, dest_city, dest_lat, dest_lon, flights_per_week)
      )
      SELECT * FROM routes

traces:
  # Draw flight paths
  - name: flight_paths
    model: ${ref(flight_routes)}
    props:
      type: scattergeo
      lon: ?{array[origin_lon, dest_lon, null]}
      lat: ?{array[origin_lat, dest_lat, null]}
      mode: "lines"
      line:
        width: ?{flights_per_week / 200}
        color: "#3498db"
      hoverinfo: "skip"
      
  # Add city markers
  - name: city_markers
    model: |
      SELECT DISTINCT city, lat, lon
      FROM (
        SELECT origin_city as city, origin_lat as lat, origin_lon as lon
        FROM ${ref(flight_routes)}
        UNION
        SELECT dest_city, dest_lat, dest_lon
        FROM ${ref(flight_routes)}
      ) cities
    props:
      type: scattergeo
      lon: ?{lon}
      lat: ?{lat}
      text: ?{city}
      mode: "markers+text"
      marker:
        size: 10
        color: "#e74c3c"
      textposition: "top center"
```

## Bubble Maps

Size represents an additional dimension:

```yaml
models:
  - name: city_populations
    source_name: geo_db
    sql: |
      WITH cities AS (
        SELECT * FROM (VALUES
          ('Tokyo', 35.68, 139.69, 37.4, 'Japan'),
          ('Delhi', 28.61, 77.20, 32.9, 'India'),
          ('Shanghai', 31.23, 121.47, 27.7, 'China'),
          ('São Paulo', -23.55, -46.63, 22.4, 'Brazil'),
          ('Mexico City', 19.43, -99.13, 21.9, 'Mexico'),
          ('Cairo', 30.04, 31.23, 21.3, 'Egypt'),
          ('Beijing', 39.90, 116.40, 20.4, 'China'),
          ('Mumbai', 19.07, 72.87, 20.4, 'India'),
          ('New York', 40.71, -74.00, 18.8, 'USA'),
          ('London', 51.51, -0.13, 9.5, 'UK')
        ) AS t(city_name, lat, lon, population_millions, country)
      )
      SELECT * FROM cities

traces:
  - name: city_bubbles
    model: ${ref(city_populations)}
    props:
      type: scattergeo
      lon: ?{lon}
      lat: ?{lat}
      text: ?{city_name || '<br>' || population_millions || 'M'}
      mode: "markers"
      marker:
        size: ?{sqrt(population_millions) * 5}
        color: ?{population_millions}
        colorscale: "Viridis"
        cmin: 0
        cmax: 40
        colorbar:
          title: "Population (M)"
        line:
          color: "white"
          width: 1
        sizemode: "diameter"
```

## Custom Map Projections

Different projections for different use cases:

```yaml
# Mercator - Good for navigation
layout:
  geo:
    projection:
      type: "mercator"
      
# Robinson - Good for world maps
layout:
  geo:
    projection:
      type: "robinson"
      
# Orthographic - Globe view
layout:
  geo:
    projection:
      type: "orthographic"
      rotation:
        lon: -100
        lat: 40
```

## Mapbox Integration

For detailed street-level maps:

```yaml
traces:
  - name: delivery_routes
    model: ${ref(delivery_data)}
    props:
      type: scattermapbox
      lon: ?{longitude}
      lat: ?{latitude}
      mode: "markers+lines"
      marker:
        size: 10
        color: ?{delivery_time}
      text: ?{address}
      
charts:
  - name: delivery_map
    traces:
      - ${ref(delivery_routes)}
    layout:
      mapbox:
        style: "streets"  # or "satellite", "outdoors", etc.
        accesstoken: "${env_var('MAPBOX_TOKEN')}"  # Optional for basic styles
        center:
          lat: 37.7749
          lon: -122.4194
        zoom: 11
```

## Best Practices

### Performance Optimization
- **Aggregation**: Pre-aggregate points for large datasets
- **Clustering**: Use marker clustering for dense point data
- **Simplification**: Reduce polygon complexity for choropleth maps

### Visual Design
```yaml
# Consistent color scales for comparison
props:
  colorscale: [
    [0, "rgb(242,240,247)"],
    [0.2, "rgb(218,218,235)"],
    [0.4, "rgb(188,189,220)"],
    [0.6, "rgb(158,154,200)"],
    [0.8, "rgb(117,107,177)"],
    [1, "rgb(84,39,143)"]
  ]
```

### Data Preparation
```yaml
# Ensure valid geographic identifiers
models:
  - name: cleaned_geo_data
    sql: |
      SELECT 
        UPPER(TRIM(country_code)) as iso_code,
        country_name,
        metric_value
      FROM raw_data
      WHERE country_code IS NOT NULL
        AND LENGTH(country_code) = 3
```

## Common Use Cases

### Sales Territory Analysis
```yaml
models:
  - name: territory_performance
    sql: |
      SELECT 
        territory_code,
        sales_rep_count,
        total_revenue,
        total_revenue / sales_rep_count as revenue_per_rep
      FROM sales_territories
```

### Supply Chain Visualization
```yaml
models:
  - name: supply_chain
    sql: |
      SELECT 
        warehouse_lat,
        warehouse_lon,
        store_lat,
        store_lon,
        shipment_volume,
        avg_delivery_days
      FROM logistics_data
```

### Demographic Analysis
```yaml
models:
  - name: demographic_data
    sql: |
      SELECT 
        county_fips,
        population,
        median_age,
        median_income,
        education_index
      FROM census_data
```

## Related Resources
- [3D Visualizations](3d.md) - For 3D geographic data
- [Choropleth Reference](../reference/configuration/trace/props/choropleth.md) - Detailed options
- [Scatter Plots](scatter.md) - Non-geographic scatter plots
- [Geographic Concepts](../concepts/geographic.md) - Working with location data

---
*Next Steps:* Explore [Hierarchical Charts](hierarchical.md) for tree-like data structures