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
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
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
        <span className="truncate">{display}</span>
        {extra}
        {children}
      </Tag>
    );
  }
);

FieldPill.displayName = 'FieldPill';

export default FieldPill;
