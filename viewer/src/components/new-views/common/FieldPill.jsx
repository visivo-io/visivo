import React from 'react';
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
 * trailing controls inside the pill (e.g. the Values aggregation `<select>` +
 * remove ✕ on a pivot chip).
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
        title={title ?? `${type}: ${display}`}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text} ${colors.border} ${className}`}
        {...rest}
      >
        {Icon && <Icon style={{ fontSize: 12 }} aria-hidden="true" className="shrink-0" />}
        <span className="truncate">{display}</span>
        {extra}
        {children}
      </Tag>
    );
  }
);

FieldPill.displayName = 'FieldPill';

export default FieldPill;
