import React, { useMemo } from 'react';
import RefTextArea from './RefTextArea';
import { fieldTypeFor, EDITORS } from './fieldTypes';

/**
 * ExpressionField — renders the right editor for a field, from its declared type.
 *
 * Every surface used to decide for itself which control an expression got, and
 * which refs it could contain. They disagreed: seven different `allowedTypes`
 * literals, a hand-maintained `TYPE_CONFIG`, and a plain textarea in the
 * Explorer that happened to be right for reasons nobody had written down. This
 * takes `{objectType, field, nested}`, asks `fieldTypes` what the rules are, and
 * renders accordingly — so a rule changes in one place.
 *
 * Covers the two raw-SQL editors today. `query-string` slots are still rendered
 * by `PropertyRow` (they need the JSON schema and slot shape to build the pill),
 * and `object-ref` by `RefDropZone`; folding those in is VIS-1243. This throws
 * on those rather than guessing, so a mis-wired call site fails loudly at the
 * call rather than rendering a subtly wrong editor.
 */
export function ExpressionField({
  objectType,
  field,
  nested = false,
  value,
  onChange,
  label,
  error,
  required = false,
  disabled = false,
  rows = 4,
  helperText,
  'data-testid': dataTestId,
}) {
  const spec = useMemo(
    () => fieldTypeFor(objectType, field, { nested }),
    [objectType, field, nested]
  );

  // A ref pasted into a ref-free field is rejected by Pydantic at save time
  // (`sql_model.py`'s nested prohibition). Say so while they're typing instead.
  const strayRef = useMemo(() => {
    if (!spec || spec.refKinds.length > 0) return null;
    return /\$\{\s*ref\s*\(/.test(value || '') ? true : null;
  }, [spec, value]);

  if (!spec) {
    throw new Error(
      `ExpressionField: no declared field type for '${objectType}.${field}'. ` +
        `Add it to fieldTypes.js rather than picking an editor here.`
    );
  }

  if (spec.editor === EDITORS.CONTEXT_SQL) {
    return (
      <RefTextArea
        value={value ?? ''}
        onChange={onChange}
        label={label}
        required={required}
        error={error}
        disabled={disabled}
        rows={rows}
        helperText={helperText}
        allowedTypes={spec.refKinds}
        acceptDrops
        // A ref here is editable in place: click the chip to re-point it
        // instead of deleting and retyping the whole `${ref(model).column}`.
        configurableChips
      />
    );
  }

  if (spec.editor === EDITORS.PLAIN_SQL) {
    return (
      <div className="space-y-1" data-testid={dataTestId || 'plain-sql-field'}>
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        )}
        {/* Deliberately a bare textarea: no ref-insert menu, no @ mention, no
            drop target. This field's refKinds are empty, so every one of those
            affordances would offer an insertion the backend rejects on save.
            Do not "upgrade" this to RefTextArea — see VIS-1253. */}
        <textarea
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          disabled={disabled}
          spellCheck={false}
          aria-label={label || 'expression'}
          data-testid="plain-sql-input"
          className="w-full resize-y rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs text-gray-800 focus:border-primary-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
        />
        {strayRef && (
          <p className="text-xs font-medium text-highlight-600" data-testid="plain-sql-ref-warning">
            References aren&apos;t available in this field — it reads columns from its parent model
            directly. Saving with a <code>ref()</code> will fail.
          </p>
        )}
        {helperText && !strayRef && <p className="text-xs text-gray-500">{helperText}</p>}
        {error && <p className="text-xs font-medium text-highlight-600">{error}</p>}
      </div>
    );
  }

  throw new Error(
    `ExpressionField: '${spec.editor}' is still rendered by its own component ` +
      `(${spec.editor === EDITORS.QUERY_STRING ? 'PropertyRow' : 'RefDropZone'}). ` +
      `Folding it in is VIS-1243.`
  );
}

export default ExpressionField;
