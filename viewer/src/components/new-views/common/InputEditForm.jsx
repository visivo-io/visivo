import React, { useState, useEffect, useRef, useCallback } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { FormInput, FormAlert } from '../../styled/FormComponents';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import TuneIcon from '@mui/icons-material/Tune';
import CodeIcon from '@mui/icons-material/Code';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import RefTextArea from './RefTextArea';
import { validateName } from './namedModel';
import { validateInputDraft, buildInputConfig } from './inputConfigValidation';
import useDebouncedSave from '../workspace/useDebouncedSave';

const INPUT_TYPES = [
  { value: 'single-select', label: 'Single Select' },
  { value: 'multi-select', label: 'Multi Select' },
];

const SINGLE_SELECT_DISPLAY_TYPES = ['dropdown', 'radio', 'toggle', 'tabs', 'autocomplete', 'slider'];
const MULTI_SELECT_DISPLAY_TYPES = ['dropdown', 'checkboxes', 'chips', 'tags', 'range-slider', 'date-range'];

/**
 * InputEditForm — VIS-898 / Track G (input slice).
 *
 * The Input editor, with two modes:
 *
 *  - `autoSave` (the right rail): edits (name/label/type/options/display/default)
 *    AUTO-SAVE on a ~500ms debounce through the shared `onSave` handler — there
 *    is NO Save button, matching the structure-form UX wired by G-1
 *    (RightRailEditPanel). The auto-save status is reported up via
 *    `onSaveStatusChange` so the SelectionChip header can render the indicator.
 *
 *  - legacy modal hosts (removed): kept the explicit
 *    Save/Cancel footer so the modal can be dismissed as before.
 *
 * In both modes validation is inline and non-blocking: obvious mistakes
 * (invalid name, default not in options, …) are caught client-side and shown
 * near the field without trapping the user, and any backend rejection is
 * surfaced inline too.
 */
const InputEditForm = ({ input, isCreate, onClose, onSave, onSaveStatusChange, autoSave = false }) => {
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
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Guards: don't auto-save the initial hydration from props, and skip the very
  // first display-type reset that fires when `inputType` initialises.
  const hydratedRef = useRef(false);

  const isEditMode = !!input && !isCreate;
  const isNewObject = input?.status === ObjectStatus.NEW;

  // Debounced auto-save bound to this input by name.
  const saveFn = useCallback(
    config => {
      if (typeof onSave !== 'function') return undefined;
      return onSave('input', config.name, config);
    },
    [onSave]
  );
  const { status: saveStatus, scheduleSave, reset } = useDebouncedSave(saveFn, { delay: 500 });

  // Surface the auto-save status to the parent (SelectionChip indicator).
  useEffect(() => {
    if (autoSave && typeof onSaveStatusChange === 'function') onSaveStatusChange(saveStatus);
  }, [autoSave, saveStatus, onSaveStatusChange]);

  useEffect(() => {
    hydratedRef.current = false;
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
    reset();
    // Mark hydration complete on the next tick so the field-change effect that
    // schedules the save ignores this prop-driven reset.
    const id = setTimeout(() => {
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
    // input identity (name) drives re-hydration; reset is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input?.name, isCreate]);

  // Reset display type to a valid value when the input type changes (after the
  // initial hydration so we don't clobber a hydrated display type).
  useEffect(() => {
    if (!hydratedRef.current) return;
    setDisplayType('dropdown');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputType]);

  // Auto-save: whenever an editable field changes (post-hydration), validate and
  // — when valid — schedule the debounced persist. Invalid drafts show inline
  // errors and are NOT round-tripped, but the form stays fully editable.
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
    const nextErrors = validateInputDraft(draft, validateName);
    setErrors(nextErrors);
    setSaveError(null);
    if (autoSave && Object.keys(nextErrors).length === 0) {
      scheduleSave(buildInputConfig(draft));
    }
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

  // Reflect a backend rejection inline (the debounced save sets status 'error';
  // we re-run the save once on demand to capture its message).
  const surfaceBackendError = useCallback(async () => {
    if (!autoSave || saveStatus !== 'error' || typeof onSave !== 'function') return;
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
    if (Object.keys(validateInputDraft(draft, validateName)).length > 0) return;
    const result = await onSave('input', name, buildInputConfig(draft));
    if (result && result.success === false) {
      setSaveError(result.error || 'Failed to save input');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus, onSave]);

  useEffect(() => {
    surfaceBackendError();
  }, [surfaceBackendError]);

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

  // Legacy modal (non-autoSave) explicit save.
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
        setShowDeleteConfirm(false);
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
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select
            value={inputType}
            onChange={e => setInputType(e.target.value)}
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
            <RefTextArea
              value={optionsQuery}
              onChange={val => setOptionsQuery(val)}
              allowedTypes={['model']}
              label=""
              rows={3}
              // eslint-disable-next-line no-template-curly-in-string
              helperText={'Use ${ref(model_name)} to reference a model'}
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
          <select
            value={displayType}
            onChange={e => setDisplayType(e.target.value)}
            className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
          error={errors.defaultValue}
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

        {autoSave ? (
          // Auto-save mode: no Save button. Delete stays as a distinct action.
          isEditMode &&
          !showDeleteConfirm && (
            <div className="flex justify-start pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded transition-colors"
                title="Delete input"
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            </div>
          )
        ) : (
          // Legacy modal mode: explicit Save / Cancel footer.
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
              <ButtonOutline
                type="button"
                onClick={onClose}
                disabled={saving || deleting}
                className="text-sm"
              >
                Cancel
              </ButtonOutline>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving || deleting}
                className="text-sm"
              >
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
        )}
      </div>
    </div>
  );
};

export default InputEditForm;
