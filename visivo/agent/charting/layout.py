"""Arrange charts, tables and inputs into dashboard rows (VIS-1433).

``recommend_layout`` is deterministic over ``rules/layout.yml``: the same items
always produce the same rows, every row says why it is where it is, and the
result validates against the ``Dashboard`` model before it is returned. It
emits a skeleton the agent fills with ``${ref()}``s already in place, which
is the part agents get wrong unaided — not the chart, the page.
"""

from typing import Dict, List, Literal, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field

from visivo.agent.charting.rules import load_layout
from visivo.agent.charting.schema import HEIGHT_TOKENS, RowRole, height_px

Kind = Literal["chart", "table", "markdown", "input"]

DEFAULT_ROLE_BY_KIND = {"chart": "breakdown", "table": "detail", "markdown": "header"}

# One sentence per section when the caller gives none; the agent replaces it.
SECTION_HEADERS = {
    "kpi": ("Headline numbers", "Start here: the totals the rest of the page explains."),
    "hero": ("The main picture", "Look for the overall shape before the breakdowns."),
    "breakdown": ("Breakdowns", "Compare the parts that make up the headline."),
    "relationship": ("Relationships and distributions", "Look for shape, spread and outliers."),
    "detail": ("Detail", "The rows behind the charts, for looking a value up."),
}

HEAVY = ("large", "xlarge", "xxlarge")


class LayoutError(ValueError):
    """Input the caller can fix: an unknown kind, a duplicate name."""


class Hints(BaseModel):
    model_config = ConfigDict(extra="forbid")

    importance: float = 0.0
    rows: Optional[int] = Field(default=None, ge=0)
    cols: Optional[int] = Field(default=None, ge=0)
    pivot: bool = False
    n_y_categories: Optional[int] = Field(default=None, ge=0)
    related_kpis: List[str] = Field(default_factory=list)
    header: Optional[str] = None
    chart: Optional[str] = None  # an input that drives one chart only


class LayoutItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    kind: Kind
    family: Optional[str] = None
    row_role: Optional[RowRole] = None
    hints: Hints = Field(default_factory=Hints)


def _ref(name):
    return f"${{ref({name})}}"


def _heavier(a, b):
    """The taller of two heights; ``compact`` is the lightest."""
    px = lambda h: -1 if h == "compact" else height_px(h)
    return a if px(a) >= px(b) else b


def _item_height(item, role, rules):
    """A row's height for one item: the role's default, raised per family,
    per heatmap rows or per table rows."""
    base = rules.rule(role).height
    if item.kind == "table":
        if item.hints.rows is not None:
            for limit, token in sorted(rules.detail_height_by_rows.items()):
                if item.hints.rows <= limit:
                    return token if role == "detail" else _heavier(token, base)
        return base
    if item.family == "heatmap" and item.hints.n_y_categories is not None:
        return _heavier(base, rules.heatmap_height.pick(item.hints.n_y_categories))
    family_height = rules.height_by_family.get(item.family or "")
    if family_height is not None and role not in ("hero", "kpi"):
        return _heavier(base, family_height)
    return base


def _row(height, items, why):
    return {"height": height, "items": items, "why": why}


def _leaf(item, width):
    return {"width": width, item.kind: _ref(item.name)}


def _markdown(width, content):
    return {"width": width, "markdown": {"content": content}}


class _Planner:
    def __init__(self, items, title, inputs, intent, rules):
        self.rules = rules
        self.title = title
        self.intent = intent
        self.warnings = []
        self.items = [LayoutItem(**i) if not isinstance(i, LayoutItem) else i for i in items]
        self.items += [
            LayoutItem(**{"kind": "input", **i}) if not isinstance(i, LayoutItem) else i
            for i in inputs or []
        ]
        names = [i.name for i in self.items]
        if len(names) != len(set(names)):
            dupes = sorted({n for n in names if names.count(n) > 1})
            raise LayoutError(f"item names must be unique; repeated: {dupes}")
        self.by_name = {i.name: i for i in self.items}
        self.charts = [i for i in self.items if i.kind == "chart"]
        self._assign_roles()

    # -- roles ------------------------------------------------------------

    def _assign_roles(self):
        for item in self.items:
            if item.kind == "input":
                item.row_role = "inputs"
            elif item.row_role is None:
                item.row_role = self.rules.row_role_by_family.get(
                    item.family or "", DEFAULT_ROLE_BY_KIND[item.kind]
                )
        heroes = sorted(
            (c for c in self.charts if c.row_role == "hero"),
            key=lambda c: -c.hints.importance,
        )
        wanted = self.rules.hero_by_intent.get(self.intent, "unset") if self.intent else "unset"
        if wanted is None:
            # kpi / detail intents: nothing is a hero.
            for chart in heroes:
                chart.row_role = "breakdown"
            return
        if wanted != "unset":
            match = next((c for c in self.charts if c.family == wanted), None)
            if match is not None:
                heroes = [match] + [h for h in heroes if h is not match]
        if not heroes:
            return
        self.hero = heroes[0]
        self.hero.row_role = "hero"
        for extra in heroes[1:]:
            extra.row_role = "breakdown"

    # -- rows ---------------------------------------------------------------

    def _chunk(self, items, role):
        rule = self.rules.rule(role)
        ordered = sorted(items, key=lambda i: -i.hints.importance)
        return [ordered[i : i + rule.max_per_row] for i in range(0, len(ordered), rule.max_per_row)]

    def _local_inputs(self, chart):
        return [i for i in self.items if i.kind == "input" and i.hints.chart == chart.name]

    def _plain_rows(self, role, items):
        rows = []
        rule = self.rules.rule(role)
        with_local = [c for c in items if c.kind == "chart" and self._local_inputs(c)]
        for chart in with_local:
            local = self._local_inputs(chart)
            height = _item_height(chart, role, self.rules)
            rows.append(
                _row(
                    height,
                    (
                        [_leaf(chart, 8)]
                        + [
                            {
                                "width": 4,
                                "rows": [
                                    {"height": "compact", "items": [_leaf(i, 12)]} for i in local
                                ],
                            }
                        ]
                        if len(local) > 1
                        else [_leaf(chart, 8), _leaf(local[0], 4)]
                    ),
                    f"{chart.name} with its own control beside it ([8, 4])",
                )
            )
        rest = [i for i in items if i not in with_local]
        for chunk in self._chunk(rest, role):
            widths = rule.widths_for(len(chunk))
            height = "compact" if role in ("inputs", "header") else None
            for item in chunk:
                height = (
                    (
                        _item_height(item, role, self.rules)
                        if height is None
                        else _heavier(height, _item_height(item, role, self.rules))
                    )
                    if role not in ("inputs", "header")
                    else "compact"
                )
            why = f"{role}: {len(chunk)} item(s) as {widths} at {height}"
            if len(chunk) > 1:
                why += ", most important first (it stacks to the top below 1024 px)"
            rows.append(_row(height, [_leaf(i, w) for i, w in zip(chunk, widths)], why))
        return rows

    def _hero_rows(self, heroes):
        cluster = self.rules.kpi_cluster
        rows = []
        for hero in heroes:
            kpis = [
                self.by_name[n]
                for n in hero.hints.related_kpis
                if n in self.by_name and self.by_name[n].row_role == "kpi"
            ]
            if len(kpis) > cluster.max_kpis:
                self.warnings.append(
                    f"{hero.name} names {len(kpis)} related KPIs; a cluster holds "
                    f"{cluster.max_kpis}, the rest stay in the KPI strip"
                )
                kpis = kpis[: cluster.max_kpis]
            if not kpis:
                rows.extend(self._plain_rows("hero", [hero]))
                continue
            self.clustered.update(k.name for k in kpis)
            height = "xlarge" if len(kpis) == 3 else self.rules.rule("hero").height
            rows.append(
                _row(
                    height,
                    [
                        _leaf(hero, cluster.widths[0]),
                        {
                            "width": cluster.widths[1],
                            "rows": [
                                {"height": cluster.sub_row_height, "items": [_leaf(k, 12)]}
                                for k in kpis
                            ],
                        },
                    ],
                    f"kpi_cluster: {hero.name} with {', '.join(k.name for k in kpis)} stacked "
                    "beside it (one KPI per sub-row; a nested 2x2 always stacks)",
                )
            )
        return rows

    def sections(self):
        """``[(role, rows)]`` in the file's order, empty roles dropped."""
        self.clustered = set()
        out = []
        by_role = {}
        for item in self.items:
            by_role.setdefault(item.row_role, []).append(item)
        hero_rows = self._hero_rows(by_role.get("hero", []))
        for role in self.rules.order:
            if role == "hero":
                rows = hero_rows
            elif role == "inputs":
                globals_ = [i for i in by_role.get("inputs", []) if not i.hints.chart]
                for i in by_role.get("inputs", []):
                    if i.hints.chart and i.hints.chart not in self.by_name:
                        self.warnings.append(
                            f"input {i.name} names unknown chart {i.hints.chart}; placed globally"
                        )
                        globals_.append(i)
                if len(globals_) > self.rules.grid.max_inputs:
                    self.warnings.append(
                        f"{len(globals_)} global inputs; more than {self.rules.grid.max_inputs} "
                        "pushes charts below the fold — drop the least important"
                    )
                rows = self._plain_rows("inputs", globals_)
            elif role == "header":
                rows = (
                    [_row("compact", [_markdown(12, f"# {self.title}")], "dashboard title")]
                    if self.title
                    else []
                )
                rows += self._plain_rows("header", by_role.get("header", []))
            elif role == "kpi":
                rows = self._plain_rows(
                    "kpi", [k for k in by_role.get("kpi", []) if k.name not in self.clustered]
                )
            else:
                rows = self._plain_rows(role, by_role.get(role, []))
            if rows:
                out.append((role, rows))
        return out

    # -- assembly -----------------------------------------------------------

    def _with_headers(self, role, rows):
        heavy = any(r["height"] in HEAVY for r in rows)
        custom = next(
            (i.hints.header for i in self.items if i.row_role == role and i.hints.header), None
        )
        if role in ("inputs", "header") or (len(rows) < 2 and not heavy and not custom):
            return rows
        title, blurb = SECTION_HEADERS.get(role, (role.title(), ""))
        content = f"## {title}\n{custom or blurb}"
        return [_row("compact", [_markdown(12, content)], f"section header for {role}")] + rows

    def dashboards(self):
        grid = self.rules.grid
        sections = self.sections()
        fixed = [(r, rows) for r, rows in sections if r in ("inputs", "header")]
        content = [(r, rows) for r, rows in sections if r not in ("inputs", "header")]
        boards, current, items_in, rows_in = [], [], 0, 0
        for role, rows in content:
            n_items = sum(
                1
                for row in rows
                for it in row["items"]
                if "chart" in it or "table" in it or "rows" in it
            )
            if current and (
                items_in + n_items > grid.max_items or rows_in + len(rows) > grid.max_content_rows
            ):
                boards.append(current)
                current, items_in, rows_in = [], 0, 0
            current.append((role, rows))
            items_in += n_items
            rows_in += len(rows)
        if current:
            boards.append(current)
        if len(boards) > 1:
            self.warnings.append(
                f"{len(boards)} dashboards: more than {grid.max_items} charts/tables or "
                f"{grid.max_content_rows} rows; split by level, the overview first"
            )
        out = []
        for index, board in enumerate(boards):
            rows = []
            for role, section_rows in fixed:
                rows.extend(section_rows)
            for role, section_rows in board:
                rows.extend(self._with_headers(role, section_rows))
            self._check_adjacent(rows)
            name = self.title or "dashboard"
            if index:
                name = f"{name} ({index + 1})"
            out.append({"name": name, "level": index, "rows": rows})
        return out

    def _check_adjacent(self, rows):
        run = 0
        for row in rows:
            run = run + 1 if row["height"] in HEAVY else 0
            if run > self.rules.grid.max_adjacent_large:
                self.warnings.append(
                    "two large rows back to back with no header between them; "
                    "add a compact markdown header or demote one"
                )
                return


def recommend_layout(items, title=None, inputs=None, intent=None, rules=None):
    """Rows for ``items`` (``[{name, kind, family?, row_role?, hints?}]``)
    and ``inputs`` (``[{name, hints: {chart?}}]``), in the order the rules
    prescribe. Returns ``{dashboard_yaml, dashboards, rows, warnings}``."""
    rules = rules or load_layout()
    planner = _Planner(items, title, inputs, intent, rules)
    boards = planner.dashboards()
    rows_why = [
        {"items": _names(row["items"]), "why": row["why"]}
        for board in boards
        for row in board["rows"]
    ]
    clean = [
        {
            "name": b["name"],
            "level": b["level"],
            "rows": [{"height": r["height"], "items": r["items"]} for r in b["rows"]],
        }
        for b in boards
    ]
    _validate(clean)
    return {
        "dashboard_yaml": yaml.safe_dump(
            {"dashboards": clean}, sort_keys=False, allow_unicode=True
        ),
        "dashboards": clean,
        "rows": rows_why,
        "warnings": planner.warnings,
    }


def _names(items):
    out = []
    for item in items:
        if "rows" in item:
            out.append([_names(r["items"]) for r in item["rows"]])
        elif "markdown" in item:
            out.append("markdown")
        else:
            out.append(next(v for k, v in item.items() if k != "width"))
    return out


def _validate(boards):
    """The skeleton must be a Dashboard the project will accept."""
    from visivo.models.dashboard import Dashboard

    for board in boards:
        Dashboard(**board)
