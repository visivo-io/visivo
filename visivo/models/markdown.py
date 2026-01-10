from pydantic import Field
from typing import Optional, Literal

from visivo.models.base.named_model import NamedModel


class Markdown(NamedModel):
    """
    The Markdown model represents formatted text content that can be displayed in dashboards.

    Markdown supports [CommonMark](https://commonmark.org/help/) and [GitHub Flavored Markdown](https://github.github.com/gfm/).
    You can also render raw HTML within your markdown.

    ### Example
    ``` yaml
    markdowns:
      - name: welcome-text
        content: |
          # Welcome to Visivo

          This is **formatted** text with support for:
          - Lists
          - **Bold** and *italic* text
          - [Links](https://visivo.io)
        align: center
        justify: start
    ```

    Then reference it in a dashboard item:
    ``` yaml
    items:
      - width: 1
        markdown: ref(welcome-text)
    ```

    ## Alignment Options

    === "Horizontal Alignment (align)"
        Controls how text aligns horizontally within the container:

        `align: left` (default)
        ```
        [Header     ]
        [Paragraph  ]
        [List       ]
        ```

        `align: center`
        ```
        [  Header   ]
        [ Paragraph ]
        [   List    ]
        ```

        `align: right`
        ```
        [     Header]
        [  Paragraph]
        [      List]
        ```

    === "Vertical Distribution (justify)"
        Controls how content blocks are distributed vertically in fixed-height containers:

        `justify: start` (default)
        ```
        [Header     ]
        [Paragraph  ]
        [List       ]
        [           ]
        [           ]
        ```

        `justify: center`
        ```
        [           ]
        [Header     ]
        [Paragraph  ]
        [List       ]
        [           ]
        ```

        `justify: between`
        ```
        [Header     ]
        [           ]
        [Paragraph  ]
        [           ]
        [List       ]
        ```

        `justify: around`
        ```
        [           ]
        [Header     ]
        [           ]
        [Paragraph  ]
        [           ]
        [List       ]
        [           ]
        ```

        `justify: evenly`
        ```
        [           ]
        [Header     ]
        [Paragraph  ]
        [List       ]
        [           ]
        ```

        `justify: end`
        ```
        [           ]
        [           ]
        [Header     ]
        [Paragraph  ]
        [List       ]
        ```
    """

    content: str = Field(
        ...,
        description="The markdown text content to display. Supports CommonMark and GitHub Flavored Markdown.",
    )
    align: Literal["left", "center", "right"] = Field(
        "left",
        description="Horizontal alignment of the markdown content. Options are 'left', 'center', or 'right'.",
    )
    justify: Literal["start", "end", "center", "between", "around", "evenly"] = Field(
        "start",
        description="Vertical distribution of content within its container. Options are 'start', 'end', 'center', 'between', 'around', or 'evenly'.",
    )
