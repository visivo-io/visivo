import React, { useEffect, useMemo } from 'react';
import useStore from '../../../stores/store';
import Input from '../../items/Input';
import { useInputsData } from '../../../hooks/useInputsData';

/**
 * InputPreview — VIS-796 / N-4.
 *
 * Renders the active input CONTROL via the EXISTING `<Input>` renderer (the
 * same widget the Dashboard mounts) plus its current selected value. No editing
 * affordances — editing lives in the right rail.
 *
 * The input record is resolved from the input store collection by name
 * (RightRailEditPanel COLLECTION_KEY['input'] = 'inputs'). Query-based inputs
 * need their dropdown options loaded; `useInputsData` (the same hook the
 * Dashboard uses) fetches them. The current value is read from the input-jobs
 * store the renderer already drives, surfaced beside the control so the preview
 * shows BOTH the control and "its current value" per the issue.
 */
const InputPreview = ({ activeObject, projectId }) => {
  const name = activeObject?.name || null;
  const inputs = useStore(s => s.inputs);
  const fetchInputs = useStore(s => s.fetchInputs);
  const selectedValue = useStore(s => s.inputSelectedValues?.[name]);

  useEffect(() => {
    if ((!inputs || inputs.length === 0) && typeof fetchInputs === 'function') {
      fetchInputs();
    }
  }, [inputs, fetchInputs]);

  const record = useMemo(
    () => (Array.isArray(inputs) ? inputs.find(i => i.name === name) || null : null),
    [inputs, name]
  );

  const inputConfig = useMemo(() => {
    if (!record) return null;
    const config = record.config || record;
    return { name: record.name, ...config };
  }, [record]);

  const namesToLoad = useMemo(() => (inputConfig ? [inputConfig.name] : []), [inputConfig]);
  useInputsData(projectId, namesToLoad);

  if (!inputConfig) {
    return (
      <div
        data-testid="input-preview-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">
          {name ? `Input "${name}" not found.` : 'No input selected.'}
        </span>
      </div>
    );
  }

  const displayValue =
    selectedValue === undefined || selectedValue === null
      ? '—'
      : Array.isArray(selectedValue)
        ? selectedValue.join(', ') || '—'
        : String(selectedValue);

  return (
    <div
      data-testid="input-preview"
      className="flex flex-1 min-h-0 flex-col items-center justify-center gap-6 bg-gray-50 p-8"
    >
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <Input input={inputConfig} projectId={projectId} itemWidth={1} />
      </div>
      <div
        data-testid="input-preview-value"
        className="text-[13px] text-gray-600"
      >
        <span className="font-medium text-gray-500">Current value: </span>
        <span className="font-mono text-gray-900">{displayValue}</span>
      </div>
    </div>
  );
};

export default InputPreview;
