import React, { useState, useCallback } from 'react';

/**
 * SaveAsMetricPrompt — Explore 2.0 Phase 4 (06 §4). The name-prompt modal for
 * "Save as metric…", pre-filled with the `<query>_<col>_<agg>` suggestion
 * (`saveAsMetricFlow.js::suggestMetricName`). Collision/aggregate-ness errors
 * surface inline and the field stays editable — the user can rename and
 * resubmit without losing the flow.
 */
const SaveAsMetricPrompt = ({ suggestedName, onSubmit, onCancel, submitting = false, error }) => {
  const [name, setName] = useState(suggestedName);

  const handleSubmit = useCallback(
    e => {
      e.preventDefault();
      if (!submitting) onSubmit(name);
    },
    [name, onSubmit, submitting]
  );

  return (
    <div
      data-testid="save-as-metric-prompt"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={e => {
        if (e.target === e.currentTarget && !submitting) onCancel?.();
      }}
    >
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-secondary-900 mb-2">Save as metric</h3>
        <label
          htmlFor="save-as-metric-name"
          className="block text-xs font-medium text-secondary-600 mb-1"
        >
          Metric name
        </label>
        <input
          id="save-as-metric-name"
          autoFocus
          data-testid="save-as-metric-name-input"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={submitting}
          className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 ${
            error
              ? 'border-highlight-400 focus:ring-highlight-200'
              : 'border-gray-300 focus:ring-primary-200'
          }`}
        />
        {error && (
          <p data-testid="save-as-metric-error" className="mt-1.5 text-xs text-highlight-600">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            data-testid="save-as-metric-cancel"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-secondary-700 hover:bg-gray-100 rounded-md disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="save-as-metric-submit"
            disabled={submitting || !name.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Save as metric'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SaveAsMetricPrompt;
