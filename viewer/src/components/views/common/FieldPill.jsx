import React from 'react';
import { PiWarningCircle } from 'react-icons/pi';
import { getTypeColors, getTypeIcon } from './objectTypeConfigs';

/**
 * FieldPill — the app's standard field/column pill.
 *
 * A single, shared way to render a semantic field or data column as a pill: the
 * type icon + the type's palette (colors + icon) pulled from the canonical
 * `objectTypeConfigs` (dimension=teal, metric=cyan, …). Used by the model
 * preview's Semantic Fields strip and the table pivot playground so a "field"
 * looks identical everywhere — never a hand-rolled per-component teal/hex.
 *
 * Pass `as="button"` (or any tag) + a `ref`/dnd props through `...rest` to make
 * the pill draggable; the visual treatment stays the same. `extra` renders
 * trailing controls inside the pill (e.g. the Values aggregation picker (brand
 * Select) + remove ✕ on a pivot chip).
 *
 * `warning` (delta-review fix, HIGH — 05-e2e-ledger.md gap review): renders
 * an explicit dangling-ref indicator (highlight ring + warning glyph) instead
 * of the type's normal palette, so a pill whose ref target no longer resolves
 * (e.g. its query chip was deleted) never looks like a silently-healthy field.
 * `warningMessage` overrides the tooltip when `warning` is set.
 *
 * Width/truncation chain (fix for a real regression surfaced by Explore 2.0
 * Phase 6c-T3's D11 live-naming pass): a long `display` string — a bound
 * source's own name is a common source, e.g. `local-duckdb_query` — used to
 * silently grow this pill past its row's available width instead of
 * ellipsizing, which in `PropertyRow.jsx`'s pill+SliceBadge row eventually
 * pushed `extra` (PillMenu's own chevron trigger) to overlap the adjacent
 * SliceBadge, making it unclickable (`exploration-build-rail.spec.mjs`'s
 * "toggling a preset... with an authored slice" story). The label's
 * `truncate` class alone was never enough: a flex/inline-flex item's default
 * `min-width: auto` refuses to shrink narrower than its own content, so
 * `overflow:hidden`/`text-overflow:ellipsis` never actually got the chance to
 * engage. Fixing this needs EVERY level in the chain to opt out of that
 * default, not just one:
 *   1. this component: `min-w-0 max-w-full` on the outer `Tag` — without a
 *      max-width, an `inline-flex` box simply sizes to its content and
 *      overflows its container rather than respecting it;
 *   2. `flex-1 min-w-0` on the label `<span>` itself — so it both claims the
 *      remaining space (after the shrink-0 icon/extra) AND is actually
 *      allowed to shrink below its own text's width, which is what lets
 *      `truncate` finally take effect;
 *   3. the CALLER's own wrapping element also needs `min-w-0` (see
 *      `PropertyRow.jsx`'s value-slot column) — this component can't fix a
 *      parent that refuses to shrink itself.
 * Pinned by `FieldPill.test.jsx`'s "long label" cases and
 * `exploration-build-rail.spec.mjs`'s slice-preset story (a real long name,
 * not a synthetic one).
 */
const FieldPill = React.forwardRef(
  (
    {
      type = 'dimension',
      name,
      label,
      as: Tag = 'span',
      className = '',
      title,
      extra = null,
      children,
      warning = false,
      warningMessage,
      'data-testid': dataTestId,
      ...rest
    },
    ref
  ) => {
    const colors = getTypeColors(type);
    const Icon = getTypeIcon(type);
    const display = label ?? name;
    return (
      <Tag
        ref={ref}
        data-testid={dataTestId}
        data-warning={warning ? 'true' : undefined}
        title={warning ? warningMessage || title || `${type}: ${display}` : title ?? `${type}: ${display}`}
        className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
          warning
            ? 'bg-highlight-50 text-highlight-700 border-highlight-300 ring-2 ring-highlight-300'
            : `${colors.bg} ${colors.text} ${colors.border}`
        } ${className}`}
        {...rest}
      >
        {warning ? (
          <PiWarningCircle
            data-testid="field-pill-warning-icon"
            style={{ fontSize: 12 }}
            className="shrink-0"
            aria-hidden="true"
          />
        ) : (
          Icon && <Icon style={{ fontSize: 12 }} aria-hidden="true" className="shrink-0" />
        )}
        <span className="flex-1 min-w-0 truncate">{display}</span>
        {extra && <span className="shrink-0 inline-flex items-center">{extra}</span>}
        {children}
      </Tag>
    );
  }
);

FieldPill.displayName = 'FieldPill';

export default FieldPill;
