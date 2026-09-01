import React, { useState, useEffect, useRef, useCallback } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { FormInput, FormAlert, FormFooter } from '../../styled/FormComponents';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import TuneIcon from '@mui/icons-material/Tune';
import CodeIcon from '@mui/icons-material/Code';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ExpressionField from './ExpressionField';
import { REF_INSERT_HINT } from './RefTextArea';
import Select from '../../common/Select';
import useFormBaseline from '../../../hooks/useFormBaseline';
import { validateName } from './namedModel';
import { validateInputDraft, buildInputConfig } from './inputConfigValidation';

const INPUT_TYPES = [
  { value: 'single-select', label: 'Single Select' },
  { value: 'multi-select', label: 'Multi Select' },
];

const SINGLE_SELECT_DISPLAY_TYPES = ['dropdown', 'radio', 'toggle', 'tabs', 'autocomplete', 'slider'];
const MULTI_SELECT_DISPLAY_TYPES = ['dropdown', 'checkboxes', 'chips', 'tags', 'range-slider', 'date-range'];

/** The blank draft for create mode / a not-yet-seeded form. */
const BLANK_INPUT_VALUES = {
  name: '',
  inputType: 'single-select',
  label: '',
  optionsMode: 'list',
  options: [],
  optionsQuery: '',
  rangeStart: '',
  rangeEnd: '',
  rangeStep: '',
  displayType: 'dropdown',
  defaultValue: '',
};

/**
 * Derive the flat form-state values from a stored input record. Kept pure and
 * beside the component so the seeding effect and the dirty check agree by
 * construction (VIS-1133 baseline pattern) — snapshot the form's own values,
 * not its built config, so a freshly-loaded form never reports itself dirty.
 */
const deriveInputValues = input => {
  const config = input.config || {};
  const values = { ...BLANK_INPUT_VALUES };
  values.name = input.name || '';
  values.inputType = config.type || 'single-select';
  values.label = config.label || '';

  if (config.range) {
    values.optionsMode = 'range';
    values.rangeStart = config.range.start != null ? String(config.range.start) : '';
    values.rangeEnd = config.range.end != null ? String(config.range.end) : '';
    values.rangeStep = config.range.step != null ? String(config.range.step) : '';
  } else if (typeof config.options === 'string') {
    // Query string options (e.g., "?{ SELECT ... }")
    values.optionsMode = 'query';
    values.optionsQuery = config.options;
  } else {
    values.optionsMode = 'list';
    values.options = Array.isArray(config.options) ? config.options : [];
  }

  const display = config.display || {};
  values.displayType = display.type || 'dropdown';

  if (config.type === 'single-select') {
    values.defaultValue = display.default?.value != null ? String(display.default.value) : '';
  } else {
    const def = display.default || {};
    if (def.values && Array.isArray(def.values)) {
      values.defaultValue = def.values.join(', ');
    } else if (typeof def.values === 'string') {
      values.defaultValue = def.values;
    }
  }

  return values;
};

/**
 * InputEditForm — VIS-898 / Track G (input slice).
 *
 * The Input editor for the right rail. Edits are held locally and persisted
 * only on an explicit Save through the shared Delete · Discard · Save footer,
 * matching every other leaf edit panel (chart/insight/source/…): Save is gated
 * on real edits, Discard reverts to the last-saved values via `useFormBaseline`,
 * and Delete marks the input for removal on the next commit.
 *
 * Validation is inline and non-blocking: obvious mistakes (invalid name,
 * default not in options, …) are caught client-side and shown near the field,
 * and any backend rejection is surfaced in the form-level alert.
 */
const InputEditForm = ({ input, isCreate, onClose, onSave, onDirtyChange }) => {
  const deleteInput = useStore(state => state.deleteInput);
  const checkCommitStatus = useStore(state => state.checkCommitStatus);

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
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Skip the display-type reset that fires when `inputType` initialises during
  // hydration — it would clobber a hydrated display type.
  const hydratedRef = useRef(false);

  const isEditMode = !!input && !isCreate;
  const isNewObject = input?.status === ObjectStatus.NEW;

  // VIS-1133: snapshot the last-saved values so the form can report dirtiness
  // and Discard can revert to them.
  const applyValues = useCallback(values => {
    setName(values.name);
    setInputType(values.inputType);
    setLabel(values.label);
    setOptions(values.options);
    setOptionsQuery(values.optionsQuery);
    setOptionsMode(values.optionsMode);
    setDisplayType(values.displayType);
    setDefaultValue(values.defaultValue);
    setRangeStart(values.rangeStart);
    setRangeEnd(values.rangeEnd);
    setRangeStep(values.rangeStep);
  }, []);
  // Per-object drafts: unsaved edits survive navigating away and reloads.
  const draftKey = isEditMode && input?.name ? `input:${input.name}` : undefined;
  const { seed, discard, isDirtyAgainst } = useFormBaseline(applyValues, draftKey);

  useEffect(() => {
    hydratedRef.current = false;
    if (input) {
      seed(deriveInputValues(input));
    } else if (isCreate) {
      seed({ ...BLANK_INPUT_VALUES });
    }
    setNewOption('');
    setErrors({});
    setSaveError(null);
    // Mark hydration complete on the next tick so the display-type reset effect
    // ignores this prop-driven seed.
    const id = setTimeout(() => {
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
    // Re-seed when the record IDENTITY (or mode) changes — including the fresh
    // object our own save writes back optimistically, which is how the baseline
    // advances after a save. `seed` is stable per `applyValues`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isCreate]);

  const dirty = isDirtyAgainst({
    name,
    inputType,
    label,
    optionsMode,
    options,
    optionsQuery,
    rangeStart,
    rangeEnd,
    rangeStep,
    displayType,
    defaultValue,
  });

  // Report upward so the tab strip's unsaved dot and its guarded close reflect
  // real edits (VIS-1133) — the rail clears it on unmount.
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Reset display type to a valid value when the input type changes (after the
  // initial hydration so we don't clobber a hydrated display type). Range
  // options are multi-select only, so switching to single-select also exits a
  // now-unreachable 'range' mode (its toggle disappears from the group).
  useEffect(() => {
    if (!hydratedRef.current) return;
    setDisplayType('dropdown');
    if (inputType === 'single-select') {
      setOptionsMode(prev => (prev === 'range' ? 'list' : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputType]);

  // Live inline validation (post-hydration): keep field errors current as the
  // user edits, without persisting anything — Save is the only write path.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const draft = {
      name,
      inputType,
      label,
      optionsMode,
      options,
      optionsQuery,
      rangeStart,
      rangeEnd,
      rangeStep,
      displayType,
      defaultValue,
    };
    setErrors(validateInputDraft(draft, validateName));
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    inputType,
    label,
    optionsMode,
    options,
    optionsQuery,
    rangeStart,
    rangeEnd,
    rangeStep,
    displayType,
    defaultValue,
  ]);

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

  const handleSave = async () => {
    const draft = {
      name,
      inputType,
      label,
      optionsMode,
      options,
      optionsQuery,
      rangeStart,
      rangeEnd,
      rangeStep,
      displayType,
      defaultValue,
    };
    const nextErrors = validateInputDraft(draft, validateName);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setSaveError(null);
    const result = await onSave('input', name, buildInputConfig(draft));
    setSaving(false);
    if (result && result.success === false) {
      setSaveError(result.error || 'Failed to save input');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setSaveError(null);

    try {
      const result = await deleteInput(input.name);
      if (result.success) {
        await checkCommitStatus();
        setShowDeleteConfirm(false);
        // Every sibling form exits after a successful delete; this one only
        // dismissed its confirm, leaving the panel sitting on a record that no
        // longer exists and rendering the not-found card.
        onClose?.();
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
    <>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
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
            <label className="block text-sm font-medium text-gray-700" id="input-type-label">
              Type
            </label>
            <Select
              aria-label="Type"
              value={inputType}
              options={INPUT_TYPES}
              onChange={setInputType}
            />
          </div>

          <FormInput
            id="input-label"
            label="Label"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Optional display label"
          />

          {/* Options Mode Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Options</label>
            <ToggleButtonGroup
              value={optionsMode}
              exclusive
              onChange={(e, newMode) => {
                if (newMode !== null) setOptionsMode(newMode);
              }}
              size="small"
            >
              <ToggleButton value="list" aria-label="static list">
                <Tooltip title="Static list">
                  <TuneIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="query" aria-label="query string">
                <Tooltip title="Query expression">
                  <CodeIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
              {inputType === 'multi-select' && (
                <ToggleButton value="range" aria-label="range">
                  <Tooltip title="Numeric range">
                    <SwapHorizIcon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
              )}
            </ToggleButtonGroup>
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
              {errors.optionsQuery && <p className="text-xs text-red-600">{errors.optionsQuery}</p>}
              <ExpressionField
                objectType="input"
                field="options"
                value={optionsQuery}
                onChange={val => setOptionsQuery(val)}
                label=""
                rows={3}
                helperText={`The option list is a query against a model. ${REF_INSERT_HINT}`}
              />
            </div>
          ) : (
            <div className="space-y-2">
              {errors.options && (
                <p className="text-xs text-red-600" data-testid="input-edit-options-error">
                  {errors.options}
                </p>
              )}

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
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
            <Select
              aria-label="Display"
              value={displayType}
              options={displayTypes.map(d => ({ value: d, label: d }))}
              onChange={setDisplayType}
            />
          </div>

          {/* Default Value */}
          <FormInput
            id="input-default"
            label={inputType === 'single-select' ? 'Default Value' : 'Default Values'}
            value={defaultValue}
            onChange={e => setDefaultValue(e.target.value)}
            error={errors.defaultValue}
            placeholder={
              inputType === 'single-select'
                ? 'Optional default value'
                : 'Optional comma-separated defaults'
            }
          />
        </div>
      </div>

      <FormFooter
        onCancel={isEditMode ? discard : onClose}
        onSave={handleSave}
        saving={saving}
        cancelLabel={isEditMode ? 'Discard' : 'Cancel'}
        cancelDisabled={isEditMode && (!dirty || saving || deleting)}
        saveDisabled={isEditMode && !dirty}
        showDelete={isEditMode && !showDeleteConfirm}
        onDeleteClick={() => setShowDeleteConfirm(true)}
        deleteConfirm={
          showDeleteConfirm && isEditMode
            ? {
                show: true,
                message: isNewObject
                  ? 'Are you sure you want to delete this input? This will discard your unsaved changes.'
                  : 'Are you sure you want to delete this input? This will mark it for deletion and remove it from YAML when you commit.',
                onConfirm: handleDelete,
                onCancel: () => setShowDeleteConfirm(false),
                deleting,
              }
            : null
        }
      />
    </>
  );
};

export default InputEditForm;
