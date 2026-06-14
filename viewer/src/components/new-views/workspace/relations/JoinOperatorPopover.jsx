import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiLinkSimple } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { getTypeColors, getTypeIcon } from '../../common/objectTypeConfigs';
import { formatRefExpression } from '../../../../utils/refString';

/**
 * JoinOperatorPopover — the authoring surface of the Relations ERD (VIS-1006).
 *
 * Opened by a column→column drag (or by picking two models via the @-mention
 * pickers), it synthesises a relation `condition` and persists it through the
 * relation store's `saveRelation(name, config)` action — the SAME config shape
 * RelationEditForm writes: `{ name, join_type, condition, is_default }`.
 *
 * Controls:
 *   - a 6-operator segmented control (= != > < >= <=);
 *   - a join_type select (inner / left / right / full);
 *   - an @-mention model+column picker for each side (so you can author without
 *     dragging, or fix up the side a drag pre-filled);
 *   - a LIVE preview of `${ref(A).colA} <op> ${ref(B).colB}`;
 *   - a custom-SQL escape hatch (free-text condition that overrides the builder).
 *
 * Rendered through a portal at a fixed viewport position; dismisses on outside
 * pointer-down, Escape, or scroll — the OpenObjectContextMenu contract.
 */

const OPERATORS = ['=', '!=', '>', '<', '>=', '<='];
const JOIN_TYPES = [
  { value: 'inner', label: 'Inner' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'full', label: 'Full' },
];

const MULBERRY = '#713b57';

/** Build the canonical relation name for a model pair. */
const defaultRelationName = (modelA, modelB) =>
  modelA && modelB ? `${modelA}_to_${modelB}` : 'new_relation';

/**
 * EndpointPicker — an @-mention-style model picker plus a column select for one
 * side of the join. Typing filters the model list; selecting a model reveals
 * its columns. Columns come straight from the dragged/hydrated model record.
 */
const EndpointPicker = ({ side, models, value, onChange, testId }) => {
  const [query, setQuery] = useState('');
  const colors = getTypeColors('model');
  const Icon = getTypeIcon('model');

  const selectedModel = models.find(m => m.name === value.model) || null;
  const filtered = useMemo(() => {
    const q = query.replace(/^@/, '').trim().toLowerCase();
    if (!q) return models;
    return models.filter(m => m.name.toLowerCase().includes(q));
  }, [models, query]);

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{side}</span>
      <div className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1">
        {Icon && <Icon style={{ fontSize: 14 }} className={`shrink-0 ${colors.text}`} aria-hidden="true" />}
        <input
          type="text"
          data-testid={`${testId}-model-input`}
          value={query || value.model || ''}
          onChange={e => {
            setQuery(e.target.value);
          }}
          placeholder="@model"
          className="w-full bg-transparent text-[12px] outline-none placeholder:text-gray-300"
        />
      </div>
      {query && filtered.length > 0 && (
        <ul
          data-testid={`${testId}-model-options`}
          className="max-h-28 overflow-auto rounded-md border border-gray-100 bg-white text-[12px] shadow-sm"
        >
          {filtered.map(m => (
            <li key={m.name}>
              <button
                type="button"
                data-testid={`${testId}-model-option-${m.name}`}
                className="flex w-full items-center px-2 py-1 text-left hover:bg-[#f9f6f8]"
                onClick={() => {
                  setQuery('');
                  onChange({ model: m.name, column: '' });
                }}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <select
        data-testid={`${testId}-column-select`}
        value={value.column || ''}
        onChange={e => onChange({ ...value, column: e.target.value })}
        disabled={!selectedModel}
        className="rounded-md border border-gray-200 px-2 py-1 text-[12px] disabled:bg-gray-50 disabled:text-gray-300"
      >
        <option value="">Select column…</option>
        {(selectedModel?.columns || selectedModel?.config?.columns || [])
          .map(c => (typeof c === 'string' ? c : c?.name))
          .filter(Boolean)
          .map(col => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
      </select>
    </div>
  );
};

const JoinOperatorPopover = ({
  x,
  y,
  models = [],
  initialA = null,
  initialB = null,
  onClose,
  onSaved,
}) => {
  const ref = useRef(null);
  const saveRelation = useStore(s => s.saveRelation);

  const [a, setA] = useState(initialA || { model: '', column: '' });
  const [b, setB] = useState(initialB || { model: '', column: '' });
  const [operator, setOperator] = useState('=');
  const [joinType, setJoinType] = useState('inner');
  const [isDefault, setIsDefault] = useState(false);
  const [customSql, setCustomSql] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Portal dismiss contract (mirrors OpenObjectContextMenu).
  useEffect(() => {
    const onDocPointer = e => {
      if (ref.current && ref.current.contains(e.target)) return;
      onClose && onClose();
    };
    const onKey = e => {
      if (e.key === 'Escape') onClose && onClose();
    };
    const onScroll = () => onClose && onClose();
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const builtCondition = useMemo(() => {
    if (!a.model || !a.column || !b.model || !b.column) return '';
    return `${formatRefExpression(a.model, a.column)} ${operator} ${formatRefExpression(
      b.model,
      b.column
    )}`;
  }, [a, b, operator]);

  const effectiveCondition = useCustom ? customSql.trim() : builtCondition;
  const canSave = effectiveCondition.length > 0 && !saving;

  const handleSave = async () => {
    if (!effectiveCondition) {
      setError('Pick a column on each side (or use custom SQL) first.');
      return;
    }
    setSaving(true);
    setError(null);
    const name = defaultRelationName(a.model, b.model);
    const config = {
      name,
      join_type: joinType,
      condition: effectiveCondition,
      is_default: isDefault || undefined,
    };
    const result = await saveRelation(name, config);
    setSaving(false);
    if (result?.success) {
      onSaved && onSaved({ name, config });
      onClose && onClose();
    } else {
      setError(result?.error || 'Failed to save relation');
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Author relation"
      data-testid="join-operator-popover"
      className="fixed z-[90] w-[320px] rounded-lg border border-[#e5e0e3] bg-white p-3 shadow-xl"
      style={{ top: y, left: x }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <PiLinkSimple style={{ fontSize: 13 }} aria-hidden="true" />
        New relation
      </div>

      <div className="flex gap-2">
        <EndpointPicker
          side="From"
          models={models}
          value={a}
          onChange={setA}
          testId="join-endpoint-a"
        />
        <EndpointPicker
          side="To"
          models={models}
          value={b}
          onChange={setB}
          testId="join-endpoint-b"
        />
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Operator
        </span>
        <div
          role="group"
          aria-label="Operator"
          data-testid="join-operator-segmented"
          className="flex overflow-hidden rounded-md border border-gray-200"
        >
          {OPERATORS.map(op => (
            <button
              key={op}
              type="button"
              data-testid={`join-operator-${op}`}
              aria-pressed={operator === op}
              onClick={() => setOperator(op)}
              className={[
                'flex-1 px-1 py-1 text-[12px] font-medium transition-colors',
                operator === op ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {op}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Join type
        </span>
        <select
          data-testid="join-type-select"
          value={joinType}
          onChange={e => setJoinType(e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1 text-[12px]"
        >
          {JOIN_TYPES.map(jt => (
            <option key={jt.value} value={jt.value}>
              {jt.label}
            </option>
          ))}
        </select>
      </div>

      <label className="mt-2 flex items-center gap-1.5 text-[12px] text-gray-600">
        <input
          type="checkbox"
          data-testid="join-is-default"
          checked={isDefault}
          onChange={e => setIsDefault(e.target.checked)}
        />
        Default relation for these models
      </label>

      <div className="mt-2 rounded-md bg-gray-50 px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Preview
        </span>
        <pre
          data-testid="join-condition-preview"
          className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] text-gray-700"
        >
          {effectiveCondition || '—'}
        </pre>
      </div>

      <details className="mt-2" onToggle={e => setUseCustom(e.target.open)}>
        <summary className="cursor-pointer text-[11px] font-medium text-gray-500">
          Custom SQL
        </summary>
        <textarea
          data-testid="join-custom-sql"
          value={customSql}
          onChange={e => setCustomSql(e.target.value)}
          rows={2}
          /* eslint-disable-next-line no-template-curly-in-string */
          placeholder="${ref(a).x} = ${ref(b).y}"
          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1 font-mono text-[11px] outline-none"
        />
        <p className="mt-0.5 text-[10px] text-gray-400">
          When set, custom SQL overrides the builder above.
        </p>
      </details>

      {error && (
        <p data-testid="join-popover-error" className="mt-2 text-[11px] text-highlight-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          data-testid="join-popover-cancel"
          onClick={() => onClose && onClose()}
          className="rounded-md px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="join-popover-save"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-md px-3 py-1 text-[12px] font-semibold text-white transition-colors disabled:opacity-40"
          style={{ background: MULBERRY }}
        >
          {saving ? 'Saving…' : 'Save relation'}
        </button>
      </div>
    </div>,
    document.body
  );
};

export { defaultRelationName };
export default JoinOperatorPopover;
