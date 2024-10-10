
## Overview

The `image` trace type is used to display raster images in a plot. This is particularly useful for visualizing images as data or overlaying images on other plot types. The image trace allows for the rendering of pixel data in a 2D grid.

You can customize the image size, position, and color scaling to represent image data effectively. Images can be used in scientific visualizations, geographic data, or any scenario where image data is needed.

!!! tip "Common Uses"
    - **Raster Images**: Displaying raster images in data visualizations.
    - **Geographic Maps**: Visualizing maps or satellite images.
    - **Image Data**: Rendering images directly as part of data exploration and analysis.

_**Check out the [Attributes](../configuration/Trace/Props/Image/#attributes) for the full set of configuration options**_

## Examples

{% raw %}
!!! example "Common Configurations"

    === "Simple Image Plot"

        Here's a simple `image` plot displaying an image based on pixel values:

        ![](../../assets/example-charts/props/image/simple-image.png)

        You can copy this code below to create this chart in your project:

        ```yaml
        models:
          - name: image-data
            args:
              - echo
              - |
                z
                0,0,1,1
                1,0,0,1
                1,1,0,0
        traces:
          - name: Simple Image Plot
            model: ref(image-data)
            props:
              type: image
              z: query(z)
        charts:
          - name: Simple Image Chart
            traces:
              - ref(Simple Image Plot)
            layout:
              title:
                text: Simple Image Plot<br><sub>Raster Image Display</sub>
        ```

    === "Image Plot with Custom Colorscale"

        This example demonstrates an `image` plot with a custom colorscale to better represent the image data:

        ![](../../assets/example-charts/props/image/custom-colorscale-image.png)

        Here's the code:

        ```yaml
        models:
          - name: image-data-custom
            args:
              - echo
              - |
                z
                0.1,0.2,0.3,0.4
                0.5,0.6,0.7,0.8
                0.9,1.0,0.2,0.3
        traces:
          - name: Image Plot with Custom Colorscale
            model: ref(image-data-custom)
            props:
              type: image
              z: query(z)
              colorscale: "Viridis"
        charts:
          - name: Image Plot with Custom Colorscale
            traces:
              - ref(Image Plot with Custom Colorscale)
            layout:
              title:
                text: Image Plot with Custom Colorscale<br><sub>Custom Coloring for Image Data</sub>
        ```

    === "Image Plot with Axis Annotations"

        This example shows an `image` plot with axis labels and annotations to provide context for the image data:

        ![](../../assets/example-charts/props/image/annotated-image.png)

        Here's the code:

        ```yaml
        models:
          - name: image-data-annotated
            args:
              - echo
              - |
                z
                1,0,0,1
                0,1,1,0
                0,0,1,1
        traces:
          - name: Image Plot with Axis Annotations
            model: ref(image-data-annotated)
            props:
              type: image
              z: query(z)
        charts:
          - name: Image Plot with Axis Annotations
            traces:
              - ref(Image Plot with Axis Annotations)
            layout:
              title:
                text: Image Plot with Axis Annotations<br><sub>Image with Axes</sub>
              xaxis:
                title:
                  text: "X Axis"
              yaxis:
                title:
                  text: "Y Axis"
        ```

{% endraw %}
