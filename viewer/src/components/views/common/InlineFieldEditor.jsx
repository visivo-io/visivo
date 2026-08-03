import React from 'react';
import { FormInput } from '../../styled/FormComponents';

/**
 * Edit a model's inline dimension or metric in place.
 *
 * These rows used to be a link: clicking one called `onNavigateToEmbedded` to
 * open the object in its own editor. Nothing ever passed that callback — a
 * repo-wide search finds the prop declared and read in three forms and supplied
 * by none — so the handler was always undefined. "Add" appended a row named
 * "Dimension 1" with an empty name and expression, and there was no way to fill
 * either in. The row could then be saved as `{name: '', expression: ''}`.
 *
 * Both types need exactly two required fields (`name`, plus `expression` — see
 * visivo/models/dimension.py and metric.py) and take an optional description, so
 * an in-place editor is the honest shape here. It also suits the right rail,
 * which has no navigation stack to push onto.
 *
 * @param {object} value - the field config ({name, expression, description})
 * @param {(next: object) => void} onChange - receives the whole updated config
 * @param {string} kind - 'dimension' | 'metric', for labels and placeholders
 */
const PLACEHOLDERS = {
  dimension: {
    name: 'order_month',
    expression: "DATE_TRUNC('month', order_date)",
  },
  metric: {
    name: 'total_revenue',
    expression: 'SUM(amount)',
  },
};

const InlineFieldEditor = ({ value, onChange, kind = 'dimension', disabled = false }) => {
  const placeholder = PLACEHOLDERS[kind] || PLACEHOLDERS.dimension;
  const set = (key, next) => onChange({ ...value, [key]: next });

  return (
    <div
      className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3"
      data-testid={`inline-${kind}-editor`}
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Name</label>
        <FormInput
          type="text"
          value={value?.name || ''}
          onChange={e => set('name', e.target.value)}
          placeholder={placeholder.name}
          disabled={disabled}
          data-testid={`inline-${kind}-name`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Expression</label>
        <FormInput
          type="text"
          value={value?.expression || ''}
          onChange={e => set('expression', e.target.value)}
          placeholder={placeholder.expression}
          disabled={disabled}
          data-testid={`inline-${kind}-expression`}
        />
        <p className="mt-1 text-[11px] text-gray-500">
          {kind === 'metric'
            ? 'An aggregate over the model’s rows.'
            : 'Computed per row — usable for grouping and filtering.'}
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Description <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <FormInput
          type="text"
          value={value?.description || ''}
          onChange={e => set('description', e.target.value)}
          disabled={disabled}
          data-testid={`inline-${kind}-description`}
        />
      </div>
    </div>
  );
};

export default InlineFieldEditor;
