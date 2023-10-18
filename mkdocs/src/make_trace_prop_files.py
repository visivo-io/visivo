import os 

TRACE_PROPS_TYPES = [
    "Mesh3d",
    "Barpolar",
    "Scattersmith",
    "Streamtube",
    "Cone",
    "Scattermapbox",
    "Scattergeo",
    "Scatterpolar",
    "Sunburst",
    "Histogram2d",
    "Isosurface",
    "Violin",
    "Scatter",
    "Image",
    "Ohlc",
    "Heatmapgl",
    "Indicator",
    "Funnelarea",
    "Carpet",
    "Icicle",
    "Surface",
    "Parcats",
    "Treemap",
    "Funnel",
    "Histogram2dcontour",
    "Contourcarpet",
    "Parcoords",
    "Candlestick",
    "Scatter3d",
    "Waterfall",
    "Choropleth",
    "Heatmap",
    "Histogram",
    "Volume",
    "Contour",
    "Scatterternary",
    "Sankey",
    "Scattercarpet",
    "Densitymapbox",
    "Choroplethmapbox",
    "Box",
    "Pie",
    "Bar",
    "Scatterpolargl",
    "Scattergl",
    "Splom",
]

def generate_file_content(attribute: str) -> str:
    # Template for each markdown file

    content = (f"""# {attribute}\n""" +
"""``` yaml
{{render_pydantic_trace_props_model(model_name = '""" + attribute.lower() + """')}}
```
"""
)
    return content

def write_file(attribute, content):
    output_dir = "model-docs/trace-props"
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, f"{attribute.lower()}.md")
    with open(file_path, 'w') as f:
        f.write(content)

def write_all_files():
    mkdocs_yml_string = "        - Trace Properties:"
    for type in  TRACE_PROPS_TYPES:
        doc_item = f"\n\t\t  - model-docs/trace-props/{type.lower()}.md"
        content = generate_file_content(type)
        write_file(type, content)
        mkdocs_yml_string += doc_item
    return mkdocs_yml_string

if __name__ == '__main__':
    mkdocs_yml_string = write_all_files()
    print(mkdocs_yml_string)
