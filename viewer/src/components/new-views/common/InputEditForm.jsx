import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { validateName } from './namedModel';

const INPUT_TYPES = [
  { value: 'single-select', label: 'Single Select' },
  { value: 'multi-select', label: 'Multi Select' },
];

const SINGLE_SELECT_DISPLAY_TYPES = ['dropdown', 'radio', 'toggle', 'tabs', 'autocomplete', 'slider'];
const MULTI_SELECT_DISPLAY_TYPES = ['dropdown', 'checkboxes', 'chips', 'tags', 'range-slider', 'date-range'];

const InputEditForm = ({ input, isCreate, onClose, onSave }) => {
  const deleteInput = useStore(state => state.deleteInput);
  const checkPublishStatus = useStore(state => state.checkPublishStatus);

  const [name, setName] = useState('');
  const [inputType, setInputType] = useState('single-select');
  const [label, setLabel] = useState('');
  const [options, setOptions] = useState([]);
  const [newOption, setNewOption] = useState('');
  const [optionsQuery, setOptionsQuery] = useState('');
  const [optionsMode, setOptionsMode] = useState('list'); // 'list' | 'query' | 'range'
  const [displayType, setDisplayType] = useState('dropdown');
  const [defaultValue, setDefaultValue] = useState('');

  // Multi-select range fields
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeStep, setRangeStep] = useState('');

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!input && !isCreate;
  const isNewObject = input?.status === ObjectStatus.NEW;

  useEffect(() => {
    if (input) {
      setName(input.name || '');
      const config = input.config || {};
      setInputType(config.type || 'single-select');
      setLabel(config.label || '');

      if (config.range) {
        setOptionsMode('range');
        setRangeStart(config.range.start != null ? String(config.range.start) : '');
        setRangeEnd(config.range.end != null ? String(config.range.end) : '');
        setRangeStep(config.range.step != null ? String(config.range.step) : '');
        setOptions([]);
        setOptionsQuery('');
      } else if (typeof config.options === 'string') {
        // Query string options (e.g., "?{ SELECT ... }")
        setOptionsMode('query');
        setOptionsQuery(config.options);
        setOptions([]);
        setRangeStart('');
        setRangeEnd('');
        setRangeStep('');
      } else {
        setOptionsMode('list');
        setOptions(Array.isArray(config.options) ? config.options : []);
        setOptionsQuery('');
        setRangeStart('');
        setRangeEnd('');
        setRangeStep('');
      }

      const display = config.display || {};
      setDisplayType(display.type || 'dropdown');

      if (config.type === 'single-select') {
        setDefaultValue(display.default?.value != null ? String(display.default.value) : '');
      } else {
        const def = display.default || {};
        if (def.values && Array.isArray(def.values)) {
          setDefaultValue(def.values.join(', '));
        } else if (typeof def.values === 'string') {
          setDefaultValue(def.values);
        } else {
          setDefaultValue('');
        }
      }
    } else if (isCreate) {
      setName('');
      setInputType('single-select');
      setLabel('');
      setOptions([]);
      setNewOption('');
      setOptionsQuery('');
      setOptionsMode('list');
      setDisplayType('dropdown');
      setDefaultValue('');
      setRangeStart('');
      setRangeEnd('');
      setRangeStep('');
    }
    setErrors({});
    setSaveError(null);
  }, [input, isCreate]);

  // Reset display type when input type changes
  useEffect(() => {
    setDisplayType('dropdown');
  }, [inputType]);

  const displayTypes = inputType === 'single-select' ? SINGLE_SELECT_DISPLAY_TYPES : MULTI_SELECT_DISPLAY_TYPES;

  const addOption = () => {
    const trimmed = newOption.trim();
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed]);
      setNewOption('');
    }
  };

  const removeOption = index => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionKeyDown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOption();
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const nameError = validateName(name);
    if (nameError) newErrors.name = nameError;

    if (optionsMode === 'range') {
      if (!rangeStart && rangeStart !== '0') newErrors.rangeStart = 'Start is required';
      if (!rangeEnd && rangeEnd !== '0') newErrors.rangeEnd = 'End is required';
      if (!rangeStep && rangeStep !== '0') newErrors.rangeStep = 'Step is required';
    } else if (optionsMode === 'query') {
      if (!optionsQuery.trim()) newErrors.optionsQuery = 'Query is required';
    } else {
      if (options.length === 0) newErrors.options = 'At least one option is required';
    }

    if (optionsMode === 'list' && inputType === 'single-select' && displayType === 'toggle' && options.length !== 2) {
      newErrors.options = 'Toggle display requires exactly 2 options';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    const config = {
      name,
      type: inputType,
    };

    if (label.trim()) config.label = label.trim();

    if (optionsMode === 'range') {
      config.range = {
        start: isNaN(Number(rangeStart)) ? rangeStart : Number(rangeStart),
        end: isNaN(Number(rangeEnd)) ? rangeEnd : Number(rangeEnd),
        step: isNaN(Number(rangeStep)) ? rangeStep : Number(rangeStep),
      };
    } else if (optionsMode === 'query') {
      config.options = optionsQuery.trim();
    } else {
      config.options = options;
    }

    if (displayType !== 'dropdown') {
      config.display = { type: displayType };
    }

    if (defaultValue.trim()) {
      if (!config.display) config.display = {};
      if (inputType === 'single-select') {
        const parsed = isNaN(Number(defaultValue)) ? defaultValue.trim() : Number(defaultValue);
        config.display.default = { value: parsed };
      } else {
        const vals = defaultValue.split(',').map(v => v.trim()).filter(Boolean);
        if (vals.length > 0) {
          config.display.default = { values: vals.map(v => isNaN(Number(v)) ? v : Number(v)) };
        }
      }
    }

    const result = await onSave('input', name, config);
    setSaving(false);

    if (!result?.success) {
      setSaveError(result?.error || 'Failed to save input');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setSaveError(null);

    try {
      const result = await deleteInput(input.name);
      if (result.success) {
        await checkPublishStatus();
        onClose();
      } else {
        setSaveError(result.error || 'Failed to delete input');
        setShowDeleteConfirm(false);
      }
    } catch (err) {
      setSaveError(err.message || 'Failed to delete input');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <form
        onSubmit={e => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-4"
      >
        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}

        <FormInput
          id="input-name"
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={isEditMode}
          error={errors.name}
          helperText={isEditMode ? 'Input names cannot be changed after creation.' : undefined}
        />

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select
            value={inputType}
            onChange={e => setInputType(e.target.value)}
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {INPUT_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <FormInput
          id="input-label"
          label="Label"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Optional display label"
        />

        {/* Options Mode Toggle */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-700">Options:</label>
          <button
            type="button"
            onClick={() => setOptionsMode('list')}
            className={`px-2 py-1 text-xs rounded ${optionsMode === 'list' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setOptionsMode('query')}
            className={`px-2 py-1 text-xs rounded ${optionsMode === 'query' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Query
          </button>
          {inputType === 'multi-select' && (
            <button
              type="button"
              onClick={() => setOptionsMode('range')}
              className={`px-2 py-1 text-xs rounded ${optionsMode === 'range' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Range
            </button>
          )}
        </div>

        {optionsMode === 'range' ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Range</label>
            <div className="grid grid-cols-3 gap-2">
              <FormInput
                id="range-start"
                label="Start"
                value={rangeStart}
                onChange={e => setRangeStart(e.target.value)}
                error={errors.rangeStart}
              />
              <FormInput
                id="range-end"
                label="End"
                value={rangeEnd}
                onChange={e => setRangeEnd(e.target.value)}
                error={errors.rangeEnd}
              />
              <FormInput
                id="range-step"
                label="Step"
                value={rangeStep}
                onChange={e => setRangeStep(e.target.value)}
                error={errors.rangeStep}
              />
            </div>
          </div>
        ) : optionsMode === 'query' ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Options Query</label>
            {errors.optionsQuery && <p className="text-xs text-red-600">{errors.optionsQuery}</p>}
            <textarea
              value={optionsQuery}
              onChange={e => setOptionsQuery(e.target.value)}
              placeholder={'?{ SELECT DISTINCT col FROM ${ref(model_name)} }'}
              rows={3}
              className="block w-full text-sm border border-gray-300 rounded-md px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-500">
              Use <code className="bg-gray-100 px-1 rounded">{'${ref(model_name)}'}</code> to reference a model.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Options</label>
            {errors.options && <p className="text-xs text-red-600">{errors.options}</p>}

            <div className="border border-gray-300 rounded-md max-h-40 overflow-y-auto">
              {options.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 italic">No options added</div>
              ) : (
                options.map((opt, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 last:border-b-0"
                  >
                    <span className="text-sm text-gray-900">{opt}</span>
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="p-0.5 text-red-400 hover:text-red-600 rounded"
                    >
                      <RemoveIcon style={{ fontSize: 14 }} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-1">
              <input
                type="text"
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={handleOptionKeyDown}
                placeholder="Add option..."
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={addOption}
                disabled={!newOption.trim()}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <AddIcon style={{ fontSize: 14 }} />
                Add
              </button>
            </div>
          </div>
        )}

        {/* Display Type */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Display</label>
          <select
            value={displayType}
            onChange={e => setDisplayType(e.target.value)}
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {displayTypes.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Default Value */}
        <FormInput
          id="input-default"
          label={inputType === 'single-select' ? 'Default Value' : 'Default Values'}
          value={defaultValue}
          onChange={e => setDefaultValue(e.target.value)}
          placeholder={
            inputType === 'single-select'
              ? 'Optional default value'
              : 'Optional comma-separated defaults'
          }
        />

        {/* Delete Confirmation */}
        {showDeleteConfirm && !isCreate && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700 mb-2">
              {isNewObject
                ? 'Are you sure you want to delete this input? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this input? This will mark it for deletion and remove it from YAML when you publish.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-3 pt-4 border-t border-gray-200">
          <div>
            {isEditMode && !showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded transition-colors"
                title="Delete input"
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <ButtonOutline type="button" onClick={onClose} disabled={saving || deleting} className="text-sm">
              Cancel
            </ButtonOutline>
            <Button type="submit" disabled={saving || deleting} className="text-sm">
              {saving ? (
                <>
                  <CircularProgress size={14} className="mr-1" style={{ color: 'white' }} />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default InputEditForm;
