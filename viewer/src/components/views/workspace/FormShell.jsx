import React, { useState, useEffect, useMemo } from 'react';
import { PiCircleNotch } from 'react-icons/pi';
import { getObjectSchema, getObjectSchemaSync } from '../../../schemas/projectSchema';
import { buildGroupSpec } from './buildGroupSpec';
import { FieldGroupList } from './FieldGroupList';

/**
 * FormShell (VIS-991)
 *
 * Thin wrapper that drives the schema-form engine end-to-end for a Visivo
 * object: it loads the object's schema slice from the bundled project `$defs`
 * (via `projectSchema.js`), builds the taxonomy group spec, and renders the
 * grouped form through `FieldGroupList`. Values round-trip through the engine's
 * get/setValueAtPath path inside each FieldGroup.
 *
 * While the schema dynamic-imports, a loading state is shown. An unknown object
 * type (no `$defs` mapping) renders an explanatory empty state.
 *
 * @param {object} props
 * @param {string} props.type - object type (e.g. 'dimension', 'metric')
 * @param {object} props.value - current values object
 * @param {function} props.onChange - (nextValue) => void
 * @param {boolean} props.disabled
 * @param {Record<string,string>} props.errors - optional field-path → message
 *   map (e.g. from the useRecordSave validation gate) threaded to the groups.
 * @param {Record<string,function>} props.overrides - optional field-name →
 *   render-function map threaded to the groups (VIS-996; see FieldGroup).
 * @param {string[]} props.excludeFields - top-level property names to withhold
 *   from the generated groups (e.g. `['name']` when the host renders identity
 *   chrome itself). Internal fields (path/file_path/type) are always hidden by
 *   buildGroupSpec.
 * @param {object} props.schemaOverride - when provided, used INSTEAD of the
 *   `$defs` slice for `type` (VIS-996 source dialects: the host resolves the
 *   per-dialect def itself and hands it over; loading is skipped).
 */
export function FormShell({
  type,
  value = {},
  onChange,
  disabled = false,
  errors = {},
  overrides = {},
  excludeFields = [],
  schemaOverride = null,
}) {
  // Seed synchronously if the schema is already cached (avoids a loading flash
  // on re-mount once the project schema has been preloaded once).
  const [schema, setSchema] = useState(() => schemaOverride || getObjectSchemaSync(type));
  const [loading, setLoading] = useState(() => !schemaOverride && !getObjectSchemaSync(type));

  useEffect(() => {
    let cancelled = false;
    if (schemaOverride) {
      setSchema(schemaOverride);
      setLoading(false);
      return undefined;
    }
    const cached = getObjectSchemaSync(type);
    if (cached) {
      setSchema(cached);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    getObjectSchema(type).then(loaded => {
      if (cancelled) return;
      setSchema(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [type, schemaOverride]);

  const defs = useMemo(() => schema?.$defs || {}, [schema]);
  // Key the memo on the JOINED exclude list so a fresh array literal per render
  // can't loop the memo (and the dependency array length stays constant).
  const excludeKey = (excludeFields || []).join(',');
  const groupSpec = useMemo(() => {
    if (!schema) return [];
    const excluded = excludeKey ? excludeKey.split(',') : [];
    if (excluded.length === 0) return buildGroupSpec(type, schema, value);
    const properties = { ...(schema.properties || {}) };
    excluded.forEach(f => delete properties[f]);
    return buildGroupSpec(type, { ...schema, properties }, value);
  }, [schema, type, value, excludeKey]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500"
        data-testid="form-shell-loading"
      >
        <PiCircleNotch size={16} className="animate-spin" />
        <span>Loading schema…</span>
      </div>
    );
  }

  if (!schema) {
    return (
      <div
        className="p-4 text-center bg-gray-50 rounded-md border border-dashed border-gray-300"
        data-testid="form-shell-empty"
      >
        <p className="text-sm text-gray-500">No schema available for type &quot;{type}&quot;</p>
      </div>
    );
  }

  return (
    <div data-testid="form-shell">
      <FieldGroupList
        groupSpec={groupSpec}
        value={value}
        onChange={onChange}
        defs={defs}
        disabled={disabled}
        errors={errors}
        overrides={overrides}
      />
    </div>
  );
}

export default FormShell;
