---
search:
  exclude: true
---
<!--start-->
## Overview

The `sankey` trace type is used to create Sankey diagrams, which visualize the flow of quantities between different nodes (or categories). Sankey diagrams are commonly used to show the transfer of resources or values, with the width of the flow lines being proportional to the size of the flow.

You can customize the colors, labels, and flow paths to represent your data and flows effectively.

!!! tip "Common Uses"
    - **Flow of Resources**: Visualizing how resources (e.g., money, energy, or materials) move between stages.
    - **Part-to-Part Relationships**: Displaying how parts contribute to other parts rather than the whole.
    - **Energy or Supply Chains**: Showing energy transfers or supply chain processes.

_**Check out the [Attributes](../configuration/Trace/Props/Sankey/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Sankey Diagram"

        Here's a simple `sankey` diagram showing how values flow between different categories:

        ![](../../assets/example-charts/props/sankey/simple-sankey.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: sankey-data
            args:
              - echo
              - |
                source,target,value
                0,1,10
                0,2,5
                1,3,15
                2,3,5
        traces:
          - name: Simple Sankey Diagram
            model: ${ref(sankey-data)}
            props:
              type: sankey
              node:
                label: ["A", "B", "C", "D"]
              link:
                source: ?{source}
                target: ?{target}
                value: ?{value}
        charts:
          - name: Simple Sankey Diagram
            traces:
              - ${ref(Simple Sankey Diagram)}
            layout:
              title:
                text: Simple Sankey Diagram<br><sub>Flow of Resources Between Nodes</sub>
        ```

    === "Sankey Diagram with Custom Colors"

        This example demonstrates a `sankey` diagram with custom node and link colors:

        ![](../../assets/example-charts/props/sankey/custom-colors-sankey.png)

        Here's the code:

        ```yaml
        models:
          - name: sankey-data-colors
            args:
              - echo
              - |
                source,target,value,color
                0,1,10,#1f77b4
                0,2,5,#ff7f0e
                1,3,15,#2ca02c
                2,3,5,#d62728
        traces:
          - name: Sankey Diagram with Custom Colors
            model: ${ref(sankey-data-colors)}
            props:
              type: sankey
              node:
                label: ["X", "Y", "Z", "W"]
                color: ?{color}
              link:
                source: ?{source}
                target: ?{target}
                value: ?{value}
        charts:
          - name: Sankey Diagram with Custom Colors
            traces:
              - ${ref(Sankey Diagram with Custom Colors)}
            layout:
              title:
                text: Sankey Diagram with Custom Colors<br><sub>Custom Colors for Nodes and Links</sub>
        ```

    === "Sankey Diagram with Hover Information"

        This example shows a `sankey` diagram where hover information displays both the value and the source-target relationship:

        ![](../../assets/example-charts/props/sankey/sankey-hover-info.png)

        Here's the code:

        ```yaml
        models:
          - name: sankey-data-hover
            args:
              - echo
              - |
                source,target,value
                0,1,20
                0,2,10
                1,3,15
                2,3,5
        traces:
          - name: Sankey Diagram with Hover Information
            model: ${ref(sankey-data-hover)}
            props:
              type: sankey
              node:
                label: ["P", "Q", "R", "S"]
              link:
                source: ?{source}
                target: ?{target}
                value: ?{value}
                hoverinfo: "source+target+value"
        charts:
          - name: Sankey Diagram with Hover Information
            traces:
              - ${ref(Sankey Diagram with Hover Information)}
            layout:
              title:
                text: Sankey Diagram with Hover Information<br><sub>Hover Info Displaying Value and Relationships</sub>
        ```

{% endraw %}
<!--end-->