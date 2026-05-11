# Table width / horizontal scroll regression — diagnosis and proposals

Tracks the user-reported issue on 2.0.1: wide table widgets overflow the
viewport on both sides instead of scrolling horizontally inside the
table card. Companion to `specs/plan/v1-final-bugfixes/B15-table-widget-overflow-and-shrink.md`,
which addressed an earlier slice of the same regression.

## Symptom

A wide pivot/data table (e.g. "Canceled and Completed Deal Revenue",
plus 9 sibling columns) renders such that the grid row containing it
spills past the viewport on both the left and right edges. There is no
horizontal scrollbar inside the table card. The page itself scrolls
horizontally (or clips, depending on body styles), and content on either
side is unreachable.

## Root cause: the intrinsic min-content propagation chain is unbroken

The B15 fix added `w-full max-w-full` to `DataTable`'s root and
`w-full h-full` to `ItemContainer`. Those make the children *willing*
to fit their parent, but they do not stop the **parent** from growing
to the children's intrinsic min-content. The min-width default on flex
and grid items is `auto`, which resolves to min-content. Nothing on the
path between the dashboard grid and the inner scroll surface sets
`min-width: 0`, so the inner content's natural width "leaks" all the
way back up.

### 1. Grid tracks expand to fit content

`viewer/src/components/project/Dashboard.jsx:222-227`:

```jsx
className={`dashboard-row w-full max-w-full ${isColumn ? 'flex' : 'grid justify-center'}`}
style={{
  ...
  gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, 1fr)`,
  ...
}}
```

`1fr` is shorthand for `minmax(auto, 1fr)`. The `auto` lower bound
means each grid track refuses to shrink below its grid items'
min-content size — regardless of how much viewport is actually
available. With `justify-center` on the grid, an oversized track
overflows symmetrically off both edges of the dashboard, which matches
what we see in the screenshot.

### 2. The DataTable's inner content sets a hard `minWidth`

`viewer/src/components/common/DataTable.jsx:180`:

```jsx
<div ref={parentRef} className="flex-1 overflow-auto">
  <div style={{ minWidth: totalWidth }}>
    {/* header + body */}
  </div>
</div>
```

`totalWidth` is the sum of `header.getSize()` across every leaf
column. That min-width is what *should* trigger the inner
`overflow-auto` to scroll — but only if some ancestor refuses to grow
past its own width. Because every ancestor defaults to
`min-width: auto`, the min-width propagates up untouched:

| Layer | Path | Why it leaks |
|---|---|---|
| Inner `flex-1 overflow-auto` | `DataTable.jsx:179` | column-direction flex item, default `min-width: auto` |
| DataTable root | `DataTable.jsx:167-170` | has `w-full max-w-full overflow-hidden`, but `min-width: auto` is unset |
| ItemContainer | `items/ItemContainer.js` | has `w-full h-full overflow-hidden`, same story |
| Flex wrapper around the item | `Dashboard.jsx:241` | `flex items-center h-full w-full max-w-full`, no `min-w-0` |
| Grid item div | `Dashboard.jsx:233-240` | `width: auto`, `min-width: auto` |
| Grid track | `Dashboard.jsx:222-227` | `1fr` = `minmax(auto, 1fr)`, expands to grid item min-content |

`overflow: hidden` on a block does **not** override `min-width: auto`
on a flex/grid item — it only affects how content is painted once the
box is sized. So the "stop sign" we expected `overflow-hidden` to be
isn't one.

### 3. The column-width floor is aggressive on its own

`viewer/src/duckdb/schemaUtils.js:90-93`:

```js
export const calculateColumnWidth = (columnName, normalizedType) => {
  const textWidth = columnName.length * CHAR_WIDTH_PX;          // 7px
  return Math.max(MIN_COLUMN_WIDTH, textWidth + HEADER_OVERHEAD_PX); // 120 / +92
};
```

For "Canceled and Completed Deal Revenue" (37 chars) that's
`37 × 7 + 92 = 351px`. With ~10 such columns,
`totalWidth ≈ 3,500px` — guaranteed to exceed almost any laptop
viewport. Combined with `DataTableHeader.jsx:59` using `truncate`,
each header is built on the assumption that it will always sit on one
line, which is what forces the wide floor in the first place.

So even when we get scrolling working, the *default* table will be
much wider than the slot, and users will scroll constantly. There's a
UX layer here on top of the correctness fix.

---

## Proposed fix A — break the overflow chain (correctness)

This is the minimum change to restore horizontal scrolling and stop the
viewport from overflowing. ~5 lines of CSS.

1. `Dashboard.jsx:222` — change
   ```diff
   - gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, 1fr)`,
   + gridTemplateColumns: isColumn ? undefined : `repeat(${totalWidth}, minmax(0, 1fr))`,
   ```
   `minmax(0, 1fr)` lets tracks honour their fr share even when the grid
   items want to be wider.
2. `Dashboard.jsx:233-240` — add `min-w-0 overflow-hidden` to the grid
   item div, so it can't grow to its child's min-content.
3. `Dashboard.jsx:241` — add `min-w-0` to the flex wrapper for the same
   reason.
4. (Belt and braces) `DataTable.jsx:179` — add `min-w-0` to the
   `flex-1 overflow-auto` element so it's permitted to be narrower than
   `totalWidth`. Without this, some browsers still let `min-width: auto`
   on a column-direction flex item leak.

After A, a wide table card stays inside its grid track and gets a
horizontal scrollbar inside the card. The dashboard row never overflows
the viewport.

### Tests to add (component-level)

* `Dashboard.test.jsx`: render a row with one wide table item; assert
  the row's grid template uses `minmax(0, 1fr)`.
* `DataTable.test.jsx`: assert the inner `flex-1` div has `min-w-0`.

### E2E story

Extend (or add) `viewer/e2e/stories/table-wide-and-narrow.spec.mjs`:

* Mount a dashboard with an 18-column table in a `width: 6` slot at a
  1280px viewport.
* Assert: the table card's `boundingBox().width` ≤ row's
  `boundingBox().width`.
* Assert: the inner table area scrolls horizontally
  (`scrollWidth > clientWidth`).
* Assert: the dashboard root's `scrollWidth` ≤ viewport width
  (i.e. no page-level horizontal scroll).

---

## Proposed fix B — smart header wrapping + adaptive column widths (UX polish)

Once scrolling works, the next problem is that the table *prefers* to
be 3,500px wide every time. We can do better when the slot is narrower
than the natural total width.

1. **Allow header wrap.** In `DataTableHeader.jsx:59` replace
   `truncate flex-1` with `whitespace-normal break-words leading-tight line-clamp-2 flex-1`.
   Tooltip the full name via `title={...}` for the rare 3-line case.
   This unlocks tighter columns visually.
2. **Container-aware sizing in `DataTable`.** Measure `parentRef`'s
   client width via `ResizeObserver`. Compare against natural
   `totalWidth = Σ calculateColumnWidth(col)`. Two regimes:
   - `natural ≤ parent` — keep current per-column sizes (or stretch
     proportionally to fill, current behaviour).
   - `natural > parent` — set each column to
     `max(MIN_COLUMN_WIDTH, parent / numColumns)` (or a weighted split
     by column type / inferred content length). The table fits, headers
     wrap, no scroll.
3. **Lower the per-char floor.** In `schemaUtils.js`, drop
   `CHAR_WIDTH_PX` from 7 → 6 (closer to the actual rendered text-sm
   advance), trim `HEADER_OVERHEAD_PX` from 92 → 60ish (the type icon /
   info button / sort icon overhead is real but currently
   over-budgeted). With wrapping allowed, the floor only matters for
   the lower-bound; we don't need to reserve a whole header line.
4. **Respect manual resize.** Once the user drags a column, mark that
   column "manual" in `columnSizing` state and exclude it from
   re-distribution on resize. Keeps drag-resize behaviour intact for
   power users.

This is layered on top of A. A and B can ship in separate PRs because
A is the regression fix that unblocks the client; B is the UX upgrade.

### Decisions (resolved)

1. **Header wrap behaviour: wrap only on overflow.** Headers stay
   single-line when natural `totalWidth ≤ parent`. They wrap to up to
   2 lines (with ellipsis on the third) only when the table would
   otherwise need to horizontally scroll. Implementation: keep
   `truncate` as the default class on `DataTableHeader` and toggle to
   `whitespace-normal break-words leading-tight line-clamp-2` only
   when the table is in compressed mode (i.e. when adaptive sizing
   has shrunk columns below their natural width). This preserves the
   visual look of every existing dashboard whose tables already fit.
2. **Manual-resize behaviour: lock manually-resized columns.** When
   the user drags a column resize handle, mark that column as
   `manual` in the table's `columnSizing` state. On viewport resize,
   adaptive sizing redistributes only non-`manual` columns; the
   user's dragged width is preserved. Implementation: maintain a
   `Set<columnId>` of manually-resized columns inside the
   `DataTable` component (or lift to the surrounding state if it
   needs to persist across renders). Reset the set when the column
   list itself changes (different table or schema change).

   **Caveat:** the manual-set lives in component state for now, so
   it doesn't survive a full page reload. If users complain about
   that, we can persist to localStorage keyed by dashboard +
   table name in a follow-up — out of scope for this PR.

### Tests to add (component-level)

* `DataTable.test.jsx`: render with `parentWidth = 600` and 10 columns
  whose natural total is 3,000; assert each rendered column's width is
  `~60` (i.e. compressed), not its `calculateColumnWidth` output.
* `DataTableHeader.test.jsx`: render with a 40-char header in a 100px
  column; assert the rendered text is not visually truncated to one
  line (look for `line-clamp-2` class, not `truncate`).

---

## Proposed fix C — stretch goals (defer unless trivially in-flight)

* **Sticky horizontal scrollbar** at the bottom edge of the viewport
  for tables taller than the viewport (ag-grid pattern). Implemented
  via a `position: sticky; bottom: 0;` proxy that mirrors the inner
  scroll surface's scrollLeft. Improves the "table taller than my
  screen" case where the real scrollbar is below the fold.
* **Sticky first column(s)** for non-pivot tables. Already works for
  pivot tables via `stickyLeftColumns`. Generalising it would let users
  scroll right while keeping the row identifier visible.
* **Auto-hide all-null columns.** Detect columns whose visible page is
  100% null (the screenshot is full of these) and default-collapse via
  the existing `ColumnVisibilityPicker`. Add a "Show null columns"
  toggle to surface them again.
* **`column_widths` hint in YAML.** Let dashboard authors override the
  per-column width directly, e.g.
  ```yaml
  table:
    column_widths:
      revenue: 120
      notes: auto
  ```
  Power-user escape hatch.

---

## Recommended sequencing

1. Land **A** as a focused, minimal-risk PR. Unblocks the 2.0.1
   client deploy.
2. Follow up with **B** as a UX PR after the open questions are
   resolved with the user. Note that swapping `truncate` → wrap is a
   visible default change for every existing dashboard, so it deserves
   its own review pass.
3. Defer **C** behind feature requests; none of it is regression work.

## Test plan summary

| Layer | What runs | Where |
|---|---|---|
| Unit (Jest) | Grid template + `min-w-0` assertions | `Dashboard.test.jsx`, `DataTable.test.jsx`, `DataTableHeader.test.jsx` |
| E2E (Playwright) | Wide-table-no-overflow, narrow-table-fits | `viewer/e2e/stories/table-wide-and-narrow.spec.mjs` |
| Manual / Playwright MCP | Empora-style dashboard at 1280 / 1440 / 1920 viewports | sandbox at `:3001` |

Plans without a Test Strategy section are incomplete; this one
includes layers, baseline (`yarn test`, `pytest`), new tests, and the
affected story.
