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
 */
export function FormShell({ type, value = {}, onChange, disabled = false }) {
  // Seed synchronously if the schema is already cached (avoids a loading flash
  // on re-mount once the project schema has been preloaded once).
  const [schema, setSchema] = useState(() => getObjectSchemaSync(type));
  const [loading, setLoading] = useState(() => !getObjectSchemaSync(type));

  useEffect(() => {
    let cancelled = false;
    const cached = getObjectSchemaSync(type);
    if (cached) {
      setSchema(cached);
      setLoading(false);
      return;
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
  }, [type]);

  const defs = useMemo(() => schema?.$defs || {}, [schema]);
  const groupSpec = useMemo(
    () => (schema ? buildGroupSpec(type, schema, value) : []),
    [schema, type, value]
  );

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
      />
    </div>
  );
}

export default FormShell;
