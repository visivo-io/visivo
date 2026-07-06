import React, { useEffect, useRef, useState } from 'react';
import {
  PiCaretDown,
  PiCaretRight,
  PiStar,
  PiDatabase,
  PiChartBar,
  PiPalette,
  PiSquaresFour,
  PiGear,
  PiSliders,
  PiPlus,
} from 'react-icons/pi';
import { PropertyRow } from '../common/SchemaEditor/PropertyRow';
import { getValueAtPath, setValueAtPath } from '../common/SchemaEditor/utils/schemaUtils';
import useFieldGroupCollapseStore, { isGroupCollapsed } from './fieldGroupCollapseStore';

/**
 * Map a group `icon` key (from buildGroupSpec's GROUP_DEFS) to a phosphor icon.
 * Keys cover both the VIS-991 semantic-field groups (star/database/…) and the
 * VIS-1020 trace-prop groups (essentials/key/encoding/…); unknown keys fall back
 * to PiSliders.
 */
const GROUP_ICONS = {
  star: PiStar,
  database: PiDatabase,
  chart: PiChartBar,
  palette: PiPalette,
  layout: PiSquaresFour,
  gear: PiGear,
  sliders: PiSliders,
  // VIS-1020 trace-prop group icon keys.
  essentials: PiStar,
  key: PiStar,
  encoding: PiDatabase,
  style: PiPalette,
  animation: PiGear,
  other: PiSliders,
};

/**
 * FieldGroup (VIS-991)
 *
 * Brand disclosure section for one taxonomy group in the schema-form engine.
 * Header: `bg-gray-50`, chevron, group icon, label, and a `present/total`
 * count badge. Collapse state persists per `{objectType}.{groupId}` via the
 * field-group collapse store (Essentials is `alwaysOpen` and never collapses).
 *
 * Fields whose spec is `expanded` (required or present-in-value) render
 * up-front; the remaining rare/unset fields hide behind a "+ N more" toggle.
 *
 * @param {object} props
 * @param {object} props.group - a group spec from buildGroupSpec
 * @param {object} props.value - the current values object
 * @param {function} props.onChange - (nextValue) => void
 * @param {object} props.defs - schema `$defs` for ref resolution in PropertyRow
 * @param {boolean} props.disabled
 * @param {Record<string,string>} props.errors - optional dot-path → inline error
 *   message map (AJV); surfaced next to the offending PropertyRow.
 * @param {Record<string,function>} props.overrides - optional field-name →
 *   render-function map (VIS-996). When a field has an override, it renders
 *   INSTEAD of the generic PropertyRow — same slot, same grouping — so a host
 *   can swap in a richer widget (e.g. RefTextArea for SQL expressions) without
 *   forking the group layout. The render fn receives
 *   `{ field, value, onChange, onRemove, disabled, error }`.
 * @param {string} props.revealPath - optional field name (dot-path) to jump to
 *   (VIS-1021 Field Finder). When this group owns `revealPath`, the group
 *   force-expands (overriding its persisted collapse AND the "+ N more" fold),
 *   scrolls the target row into view, and flashes a highlight ring.
 */
export function FieldGroup({
  group,
  value = {},
  onChange,
  defs = {},
  disabled = false,
  errors = {},
  overrides = {},
  revealPath = null,
}) {
  const { id, label, icon, objectType, alwaysOpen, fields = [] } = group || {};

  const collapsedMap = useFieldGroupCollapseStore(s => s.collapsed);
  const toggleCollapsed = useFieldGroupCollapseStore(s => s.toggleCollapsed);
  const persistedCollapsed = isGroupCollapsed(collapsedMap, objectType, id);

  // Rare/unset fields ("+ N more"). Local — not persisted; expanding the group's
  // tail is a transient action.
  const [showMore, setShowMore] = useState(false);

  // VIS-1021 reveal: does THIS group own the field being jumped to?
  const ownsReveal = !!revealPath && fields.some(f => f.name === revealPath);
  const collapsed = alwaysOpen || ownsReveal ? false : persistedCollapsed;

  const revealRef = useRef(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!ownsReveal) return undefined;
    // Ensure the tail is unfolded so a rare/unset target renders, then scroll.
    setShowMore(true);
    const el = revealRef.current;
    if (el) {
      // jsdom has no scrollIntoView — guard so the highlight still runs in tests.
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ownsReveal, revealPath]);

  const GroupIcon = GROUP_ICONS[icon] || PiSliders;

  const upFront = fields.filter(f => f.expanded);
  const rest = fields.filter(f => !f.expanded);
  const presentCount = fields.filter(f => f.present || f.required).length;

  const handleHeaderClick = () => {
    if (alwaysOpen) return;
    toggleCollapsed(objectType, id);
  };

  const handleFieldChange = (name, fieldValue) => {
    onChange(setValueAtPath(value, name, fieldValue));
  };

  const handleFieldRemove = name => {
    onChange(setValueAtPath(value, name, undefined));
  };

  const visibleFields = collapsed ? [] : showMore ? [...upFront, ...rest] : upFront;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`field-group-${id}`}>
      <button
        type="button"
        onClick={handleHeaderClick}
        disabled={alwaysOpen}
        aria-expanded={!collapsed}
        className={`w-full flex items-center gap-2 px-3 py-2 bg-gray-50 text-left transition-colors ${
          alwaysOpen ? 'cursor-default' : 'hover:bg-gray-100 cursor-pointer'
        }`}
        data-testid={`field-group-header-${id}`}
      >
        <span className="text-gray-400">
          {collapsed ? <PiCaretRight size={14} /> : <PiCaretDown size={14} />}
        </span>
        <GroupIcon size={16} className="text-gray-500" />
        <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
        <span
          className="text-xs font-medium text-gray-500 bg-gray-200 rounded-full px-2 py-0.5"
          data-testid={`field-group-badge-${id}`}
        >
          {presentCount}/{fields.length}
        </span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-1.5 p-2">
          {visibleFields.map(field => {
            const isRevealTarget = field.name === revealPath;
            const rowProps = {
              'data-field-path': field.name,
              ref: isRevealTarget ? revealRef : undefined,
              className: `rounded-md transition-shadow ${
                isRevealTarget && flash ? 'ring-2 ring-primary-400 ring-offset-1' : ''
              }`,
            };
            const override = overrides[field.name];
            if (typeof override === 'function') {
              return (
                <div key={field.name} data-testid={`field-override-${field.name}`} {...rowProps}>
                  {override({
                    field,
                    value: getValueAtPath(value, field.name),
                    onChange: newValue => handleFieldChange(field.name, newValue),
                    onRemove: field.required ? undefined : () => handleFieldRemove(field.name),
                    disabled,
                    error: errors[field.name],
                  })}
                </div>
              );
            }
            return (
              <div key={field.name} {...rowProps}>
                <PropertyRow
                  path={field.name}
                  value={getValueAtPath(value, field.name)}
                  onChange={newValue => handleFieldChange(field.name, newValue)}
                  onRemove={field.required ? undefined : () => handleFieldRemove(field.name)}
                  schema={field.schema}
                  defs={defs}
                  description={field.schema?.description || ''}
                  disabled={disabled}
                  error={errors[field.name]}
                />
              </div>
            );
          })}

          {!showMore && rest.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="flex items-center gap-1 self-start px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-md transition-colors"
              data-testid={`field-group-more-${id}`}
            >
              <PiPlus size={12} />
              {rest.length} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default FieldGroup;
