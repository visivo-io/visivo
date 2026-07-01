import React from 'react';
import { getTypeColors, getTypeIcon, getTypeByValue } from '../common/objectTypeConfigs';
import SaveStateIndicator from './SaveStateIndicator';

/**
 * SelectionChip — VIS-802 / Track G G-1.
 *
 * The header strip every right-rail Edit form gets: a rainbow type-coloured
 * chip (icon + name + type label) identifying WHAT is being edited, plus the
 * inline auto-save status on the right. Type colours + icons come exclusively
 * from `objectTypeConfigs.js` (rainbow); mulberry/primary is selection-only and
 * is NOT used here.
 *
 * Props:
 *   - type   (string) canonical object type ('chart' | 'row' | 'dashboard' | …).
 *   - name   (string) display name / label.
 *   - subtitle (string) optional secondary line (e.g. "Row 2 · 3 items").
 *   - saveStatus (string) status from useDebouncedSave (renders SaveStateIndicator).
 */
const SelectionChip = ({ type, name, subtitle, saveStatus }) => {
  const colors = getTypeColors(type);
  const Icon = getTypeIcon(type);
  const typeDef = getTypeByValue(type);
  const typeLabel = typeDef?.singularLabel || type;

  return (
    <div
      data-testid="right-rail-selection-chip"
      data-object-type={type}
      className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}
        >
          {Icon && <Icon style={{ fontSize: 14 }} />}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold text-gray-900" title={name}>
            {name}
          </span>
          <span className="truncate text-[10.5px] uppercase tracking-wide text-gray-400">
            {subtitle || typeLabel}
          </span>
        </div>
      </div>
      {saveStatus && <SaveStateIndicator status={saveStatus} />}
    </div>
  );
};

export default SelectionChip;
