import React, { useCallback, useMemo } from 'react';
import RefTextArea from './RefTextArea';
import { fieldTypeFor, EDITORS } from './fieldTypes';
import { parseQueryString, serializeQueryString } from '../../../utils/queryString';

/**
 * Renders the right editor for a field from its declared type (`fieldTypes.js`),
 * so ref/drop rules live in one registry instead of per call site.
 *
 * Covers the text-field editors (`context-sql`, `query-string`, `plain-sql`).
 * `object-ref` stays with `RefDropZone`; `query-string` inside `PropertyRow`
 * builds a richer pill for the same type and also doesn't come through here.
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
  scopedToModel = null,
  'data-testid': dataTestId,
}) {
  const spec = useMemo(
    () => fieldTypeFor(objectType, field, { nested }),
    [objectType, field, nested]
  );

  // A ref in a ref-free field is rejected server-side at save; warn while typing.
  const strayRef = useMemo(() => {
    if (!spec || spec.refKinds.length > 0) return null;
    return /\$\{\s*ref\s*\(/.test(value || '') ? true : null;
  }, [spec, value]);

  // query-string's `?{ }` wrapper is invisible to RefTextArea (context-sql has
  // none), so wrap/unwrap here — same split PropertyRow uses for this type.
  const isQueryString = spec?.editor === EDITORS.QUERY_STRING;
  const parsedIncoming = useMemo(
    () => (isQueryString ? parseQueryString(value) : null),
    [isQueryString, value]
  );
  const displayValue = isQueryString
    ? parsedIncoming
      ? parsedIncoming.body
      : value ?? ''
    : value ?? '';
  const incomingSlice = parsedIncoming ? parsedIncoming.slice : null;
  const handleChange = useCallback(
    raw => {
      if (!isQueryString) {
        onChange(raw);
        return;
      }
      onChange(serializeQueryString({ body: raw, slice: incomingSlice }));
    },
    [isQueryString, incomingSlice, onChange]
  );

  if (!spec) {
    throw new Error(
      `ExpressionField: no declared field type for '${objectType}.${field}'. ` +
        `Add it to fieldTypes.js rather than picking an editor here.`
    );
  }

  if (spec.editor === EDITORS.CONTEXT_SQL || spec.editor === EDITORS.QUERY_STRING) {
    return (
      <RefTextArea
        value={displayValue}
        onChange={handleChange}
        label={label}
        required={required}
        error={error}
        disabled={disabled}
        rows={rows}
        helperText={helperText}
        allowedTypes={spec.refKinds}
        acceptDrops
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
        {/* Bare textarea, deliberately — refKinds is empty here. Don't
            "upgrade" to RefTextArea (VIS-1253). */}
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
