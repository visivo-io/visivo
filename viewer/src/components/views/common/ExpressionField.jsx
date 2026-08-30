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
 * Covers every editor that is a TEXT FIELD: `context-sql`, `query-string`, and
 * `plain-sql`. `object-ref` is a whole-object pointer rather than an
 * expression and stays with `RefDropZone`; this throws on it rather than
 * guessing, so a mis-wired call site fails loudly at the call rather than
 * rendering a subtly wrong editor.
 *
 * `PropertyRow` also renders `query-string` fields and does NOT come through
 * here — it builds a full pill from the JSON schema and the slot shape, which
 * is a richer surface for the same declared type, not a competing one. Every
 * OTHER query-string field is a plain ref-capable textarea and belongs here.
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
  // The model this field is scoped to, when it is. Named in the copy so a user
  // can tell at a glance WHY refs are unavailable — and can catch us being
  // wrong about it.
  scopedToModel = null,
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

  // CONTEXT_SQL and QUERY_STRING differ in GRAMMAR (`?{ }` marks a value as SQL
  // rather than a literal) but not in affordances: both hold `${ref()}`s, so
  // both accept drops of their declared kinds and both let a chip be
  // re-pointed. Splitting them here was how `input.options` ended up with a
  // ref-capable field you could not drop a model onto (VIS-1327).
  if (spec.editor === EDITORS.CONTEXT_SQL || spec.editor === EDITORS.QUERY_STRING) {
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
        // Driven by the registry, not by the call site: a field that declares
        // which types it accepts should be able to accept one. Empty refKinds
        // falls to the PLAIN_SQL branch below, which has neither affordance.
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
            {scopedToModel ? (
              <>
                Scoped to <strong>{scopedToModel}</strong>, so it reads that model&apos;s columns
                directly — references aren&apos;t available here and saving with a{' '}
                <code>ref()</code> will fail.
              </>
            ) : (
              <>
                References aren&apos;t available in this field — it reads columns from its parent
                model directly. Saving with a <code>ref()</code> will fail.
              </>
            )}
          </p>
        )}
        {helperText && !strayRef && <p className="text-xs text-gray-500">{helperText}</p>}
        {error && <p className="text-xs font-medium text-highlight-600">{error}</p>}
      </div>
    );
  }

  throw new Error(
    `ExpressionField: '${spec.editor}' is still rendered by its own component ` +
      `(RefDropZone). ` +
      `Folding it in is VIS-1243.`
  );
}

export default ExpressionField;
