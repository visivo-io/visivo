import React from 'react';
import { FieldGroup } from './FieldGroup';

/**
 * FieldGroupList (VIS-991)
 *
 * Renders an ordered group spec (from `buildGroupSpec`) as a stack of
 * `<FieldGroup>` disclosure sections. Each group renders its fields through the
 * existing SchemaEditor `PropertyRow` widgets, so the full typed-field engine
 * (enums, colors, query-string toggle, slicing, …) is reused unchanged.
 *
 * @param {object} props
 * @param {Array} props.groupSpec - ordered array of group specs
 * @param {object} props.value - the current values object
 * @param {function} props.onChange - (nextValue) => void
 * @param {object} props.defs - schema `$defs` for ref resolution in PropertyRow
 * @param {boolean} props.disabled
 * @param {Record<string,string>} props.errors - optional dot-path → inline error
 *   message map (AJV) threaded to each FieldGroup/PropertyRow.
 */
export function FieldGroupList({
  groupSpec = [],
  value = {},
  onChange,
  defs = {},
  disabled = false,
  errors = {},
}) {
  if (!Array.isArray(groupSpec) || groupSpec.length === 0) {
    return (
      <div className="p-4 text-center bg-gray-50 rounded-md border border-dashed border-gray-300">
        <p className="text-sm text-gray-500">No fields to configure</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="field-group-list">
      {groupSpec.map(group => (
        <FieldGroup
          key={group.id}
          group={group}
          value={value}
          onChange={onChange}
          defs={defs}
          disabled={disabled}
          errors={errors}
        />
      ))}
    </div>
  );
}

export default FieldGroupList;
