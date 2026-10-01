from typing import List, Literal, Optional

from pydantic import Field, model_validator

from visivo.models.base.parent_model import ParentModel
from visivo.models.dashboards.base_dashboard import BaseDashboard
from visivo.models.dashboards.template_html import SLOT_ATTRIBUTE, analyze_template


class TemplateDashboard(BaseDashboard, ParentModel):
    """
    A TemplateDashboard lays out its charts, tables, markdowns and inputs with HTML you
    write, instead of the `rows`/`items` grid.

    Use it when the arrangement itself carries meaning: a KPI banner above an asymmetric
    split, a narrative report with charts between paragraphs, a diagram with figures
    pinned to it, or a brand template you already have in HTML. Most dashboards should
    stay on the grid.

    Mark each place an item goes with `data-visivo-item="<name>"`. The element's
    contents are replaced by the chart, table, markdown or input with that name, and the
    item fills the element — so the template's CSS decides every size. Give each slot
    element a height: a chart needs a measurable box, and a slot without one falls back
    to 396px, the grid's `medium` row.

    !!! example

        <!-- visivo-example: skip - template_file is read from disk when the project is parsed -->
        ``` yaml
        dashboards:
          - name: Quarterly Review
            template_file: templates/quarterly-review.html
        ```

        ``` html title="templates/quarterly-review.html"
        <style>
          .banner { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .kpi { height: 160px; }
          .wide { height: 420px; }
        </style>
        <section class="banner">
          <div class="kpi" data-visivo-item="revenue-kpi"></div>
          <div class="kpi" data-visivo-item="margin-kpi"></div>
        </section>
        <article>
          <p>Revenue held through the quarter.</p>
          <div class="wide" data-visivo-item="revenue-by-month"></div>
        </article>
        ```

    `template_file` is resolved relative to the YAML file that declares the dashboard.
    For short templates, `template` takes the HTML inline instead; set one or the other.

    ``` yaml
    dashboards:
      - name: Revenue Note
        template: |
          <p>Revenue held through the quarter.</p>
          <div style="height: 420px" data-visivo-item="revenue-by-month"></div>
    ```

    ## What the HTML may contain

    Templates are HTML and CSS only, checked when the project compiles. Scripts, event
    handler attributes (`onclick`, ...), `<iframe>`, `<form>`, `<link>`, `@import` and
    `javascript:` URLs are rejected, as is any tag or attribute outside a fixed allowlist
    of document, table, text and SVG drawing elements. Links and images may use
    `http(s)`, relative URLs, or (for images) `data:image/...`.

    The template renders inside its own shadow root: its CSS styles only the template,
    and the rest of the page's CSS does not reach into it. Inherited properties such as
    `font-family` and `color` do flow from a slot element into the item it holds.

    Template dashboards are edited as files, not in the `visivo serve` canvas.
    """

    type: Literal["template"] = Field(
        "template", description="The type of dashboard (always 'template')"
    )
    template: Optional[str] = Field(
        None,
        description=(
            "The dashboard's HTML, inline. Mark where items go with "
            f'`{SLOT_ATTRIBUTE}="<name>"`. Mutually exclusive with `template_file`.'
        ),
    )
    template_file: Optional[str] = Field(
        None,
        description=(
            "Path to an HTML file holding the dashboard's template, relative to the YAML "
            "file that declares the dashboard. Mutually exclusive with `template`."
        ),
    )

    @model_validator(mode="after")
    def validate_template(self):
        if self.template is None:
            if self.template_file:
                raise ValueError(
                    f"template_file '{self.template_file}' was not loaded. Template files are "
                    "read when the project is parsed from disk."
                )
            raise ValueError("A template dashboard needs a `template` or a `template_file`.")
        violations = analyze_template(self.template).violations
        if violations:
            source = f"'{self.template_file}'" if self.template_file else "the template"
            details = "\n".join(f"  {violation}" for violation in violations)
            raise ValueError(f"The HTML in {source} is not allowed:\n{details}")
        return self

    def item_names(self) -> List[str]:
        return analyze_template(self.template or "").item_names

    def child_items(self):
        return [f"ref({name})" for name in self.item_names()]
