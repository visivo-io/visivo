import React, { useState, useEffect, useRef } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import RefTextArea from './RefTextArea';
import Select from '../../common/Select';
import TracePropsEditor from './TracePropsEditor';
import { validateName } from './namedModel';
import { getTypeByValue } from './objectTypeConfigs';
import { isEmbeddedObject } from './embeddedObjectUtils';
import { BackNavigationButton } from '../../styled/BackNavigationButton';
import { useDebounce } from '../../../hooks/useDebounce';
import useRecordSave from '../../../hooks/useRecordSave';
import SaveStateIndicator from '../workspace/SaveStateIndicator';
import {
  SectionContainer,
  SectionTitle,
  EmptyState,
  AlertContainer,
  AlertText
} from '../../styled/FormLayoutComponents';

/**
 * InsightEditForm - Form component for editing/creating insights
 *
 * Insights define visualization properties (props) and client-side interactions.
 *
 * Props:
 * - insight: Insight object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Function(type, name, config) - Unified save callback
 * - onGoBack: Callback to navigate back to parent (for embedded insights)
 * - isPreviewOpen: Whether the preview panel is open
 * - setIsPreviewOpen: Function to toggle the preview panel
 * - setPreviewConfig: Function to set the preview configuration in parent
 *
 * VIS-1018: in EDIT mode each field change auto-saves through the unified
 * `useRecordSave('insight', …)` backbone (debounced + schema-gated optimistic
 * persist) — there is no Save button, only a save-state indicator. CREATE mode
 * keeps its explicit Save button (the record isn't in the store collection yet).
 */
const InsightEditForm = ({ insight, isCreate, onClose, onSave, onGoBack, isPreviewOpen, setIsPreviewOpen, setPreviewConfig }) => {
  const { deleteInsight, checkCommitStatus } = useStore();

  // Form state - Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Props state - the insight's Plotly props object (carries `.type`). Fully
  // controlled by TracePropsEditor; the parent (this form) persists it on save.
  const [props, setProps] = useState({ type: 'scatter' });

  // Interactions state - array of {type: 'filter'|'split'|'sort', value: string}
  const [interactions, setInteractions] = useState([]);

  // UI state
  const [errors, setErrors] = useState({});
  // VIS-993: TracePropsEditor reports AJV validity; Save is held while false so
  // a plotly-invalid props object is never handed to the save path (which the
  // useRecordSave gate would block anyway — this surfaces the reason here).
  const [propsValid, setPropsValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!insight && !isCreate;
  const isNewObject = insight?.status === ObjectStatus.NEW;
  const isEmbedded = isEmbeddedObject(insight);
  const parentName = insight?._embedded?.parentName;
  const parentType = insight?._embedded?.parentType;

  // Edit mode auto-saves through the unified backbone; create keeps its Save button.
  const isAutoSave = isEditMode;

  // Unified optimistic + debounced + schema-validated save backbone (VIS-1018).
  // scheduleSave writes the config optimistically into the insight store, then
  // debounce-persists ONLY if it passes schema validation; otherwise it reports
  // status:'invalid' with per-field gate errors and persists nothing.
  const {
    scheduleSave,
    status: autoSaveStatus,
    errors: gateErrors,
  } = useRecordSave('insight', insight?.name || null);

  const gateErrorText =
    gateErrors && gateErrors.length > 0
      ? gateErrors.map(e => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ')
      : null;

  // Build the insight config from the current form state (shared by the manual
  // create-mode save AND the debounced auto-save path). Mirrors the payload the
  // legacy handleSave produced: embedded insights omit `name`; empty
  // description/interactions are dropped so they don't pollute the YAML config.
  const buildConfig = () => {
    const config = isEmbedded ? { props } : { name, props };

    if (description) {
      config.description = description;
    }

    const nonEmptyInteractions = interactions
      .filter(i => i.value && i.value.trim())
      .map(i => ({ [i.type]: i.value }));

    if (nonEmptyInteractions.length > 0) {
      config.interactions = nonEmptyInteractions;
    }

    return config;
  };

  // Debounce the values for preview updates
  const debouncedProps = useDebounce(props, 500);
  const debouncedInteractions = useDebounce(interactions, 500);

  // Set preview config when values change
  useEffect(() => {
    if (setPreviewConfig) {
      setPreviewConfig({
        insightConfig: {
          name: name || insight?.name || '__preview__',
          props: debouncedProps,
          interactions: debouncedInteractions.map(i => {
            if (i.type === 'filter') return { filter: i.value };
            if (i.type === 'split') return { split: i.value };
            if (i.type === 'sort') return { sort: i.value };
            return {};
          }).filter(i => Object.keys(i).length > 0),
        },
        projectId: useStore.getState().project?.id,
      });
    }
  }, [setPreviewConfig, name, insight?.name, debouncedProps, debouncedInteractions]);

  // Set true once the form has hydrated from `insight`, so the auto-save effect
  // below never fires on hydration (only on real user edits). Keyed on the
  // record NAME (not identity), so an optimistic-save refetch doesn't re-hydrate
  // and clobber in-progress edits.
  const hydratedRef = useRef(false);

  // Initialize form when insight changes
  useEffect(() => {
    hydratedRef.current = false;
    if (insight) {
      // Edit mode - populate from existing insight
      setName(insight.name || '');

      const configToUse = insight.config;
      setDescription(configToUse?.description || '');

      // Props - the full Plotly props object (carries `.type`).
      setProps(configToUse?.props || { type: 'scatter' });

      // Interactions - each interaction has only one type (filter, split, or sort)
      const insightInteractions = configToUse?.interactions || [];
      setInteractions(
        insightInteractions.map(i => {
          // Determine which type this interaction is
          if (i.filter) return { type: 'filter', value: i.filter };
          if (i.split) return { type: 'split', value: i.split };
          if (i.sort) return { type: 'sort', value: i.sort };
          return { type: 'filter', value: '' }; // Default
        })
      );
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setDescription('');
      setProps({ type: 'scatter' });
      setInteractions([]);
    }
    setErrors({});
    setSaveError(null);
    // Defer past the state-set renders so the auto-save effect runs while still
    // un-hydrated (only real edits schedule a save).
    const id = setTimeout(() => {
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight?.name, isCreate]);

  // Auto-save: whenever an editable field changes (post-hydration in edit mode),
  // schedule a save once the local minimum (a name for standalone insights) is
  // met. The schema gate in scheduleSave still decides whether it persists.
  useEffect(() => {
    if (!isAutoSave || !hydratedRef.current) return;
    if (!isEmbedded && !name.trim()) return;
    scheduleSave(buildConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, props, interactions]);

  const validateForm = () => {
    const newErrors = {};

    // Skip name validation for embedded insights (they don't require names)
    if (!isEmbedded) {
      const nameError = validateName(name);
      if (nameError) {
        newErrors.name = nameError;
      }
    }

    if (!props.type) {
      newErrors.propsType = 'Chart type is required';
    }

    if (props.type && !propsValid) {
      newErrors.props = 'Fix the invalid trace properties before saving.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    // Build config object - embedded insights don't include name
    const config = buildConfig();

    // Call unified save - parent handles embedded vs standalone routing
    const result = await onSave('insight', name, config);

    setSaving(false);

    if (!result?.success) {
      setSaveError(result?.error || 'Failed to save insight');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteInsight(insight.name);
    setDeleting(false);

    if (result?.success) {
      await checkCommitStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete insight');
      setShowDeleteConfirm(false);
    }
  };

  // Interaction management
  const addInteraction = () => {
    setInteractions([...interactions, { type: 'filter', value: '' }]);
  };

  const removeInteraction = index => {
    setInteractions(interactions.filter((_, i) => i !== index));
  };

  const updateInteractionType = (index, newType) => {
    const updated = [...interactions];
    updated[index] = { ...updated[index], type: newType };
    setInteractions(updated);
  };

  const updateInteractionValue = (index, newValue) => {
    const updated = [...interactions];
    updated[index] = { ...updated[index], value: newValue };
    setInteractions(updated);
  };

  // Interaction type options
  const INTERACTION_TYPES = [
    { value: 'filter', label: 'Filter', helperText: 'Client-side filter condition (WHERE clause logic).' },
    { value: 'split', label: 'Split', helperText: 'Column to split data into multiple traces.' },
    { value: 'sort', label: 'Sort', helperText: 'Column and direction to sort by (e.g., "date DESC").' },
  ];

  return (
    <>
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* Embedded insight back navigation */}
          {isEmbedded && onGoBack && (
            <BackNavigationButton
              onClick={onGoBack}
              typeConfig={getTypeByValue(parentType)}
              label={getTypeByValue(parentType)?.singularLabel || parentType}
              name={parentName}
            />
          )}

          {/* Basic Fields Section */}
          <SectionContainer>
            <SectionTitle>
              Basic Information
            </SectionTitle>

            {/* Name field - hidden for embedded insights */}
            {!isEmbedded && (
              <div className="relative">
                <input
                  type="text"
                  id="insightName"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={isEditMode}
                  placeholder=" "
                  className={`
                    block w-full px-3 py-2.5 text-sm text-gray-900
                    bg-white rounded-md border appearance-none
                    focus:outline-none focus:ring-2 focus:border-primary-500
                    peer placeholder-transparent
                    ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}
                    ${errors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
                  `}
                />
                <label
                  htmlFor="insightName"
                  className={`
                    absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
                    bg-white px-1 left-2
                    peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
                    peer-placeholder-shown:top-1/2
                    peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
                    ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
                  `}
                >
                  Insight Name<span className="text-red-500 ml-0.5">*</span>
                </label>
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>
            )}

            {/* Description (optional) */}
            <div className="relative">
              <textarea
                id="insightDescription"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder=" "
                rows={2}
                className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 peer placeholder-transparent resize-y"
              />
              <label
                htmlFor="insightDescription"
                className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-3 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 text-gray-500 peer-focus:text-primary-500"
              >
                Description
              </label>
            </div>

          </SectionContainer>

          {/* Props Section */}
          <SectionContainer>
            <SectionTitle>
              Visualization Props
            </SectionTitle>

            {/* Grouped, schema-driven, AJV-validated props editor. Fully controlled:
                it owns no persistence — this form persists `props` on save. */}
            <TracePropsEditor
              ownerName={name || 'insight'}
              props={props}
              onChange={setProps}
              onValidityChange={(ok) => setPropsValid(ok)}
            />
            {errors.props && (
              <p className="mt-1 text-xs text-red-500" data-testid="insight-props-invalid">
                {errors.props}
              </p>
            )}
            {errors.propsType && <p className="mt-1 text-xs text-red-500">{errors.propsType}</p>}
          </SectionContainer>

          {/* Interactions Section */}
          <SectionContainer>
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="text-sm font-medium text-gray-700">Interactions</h3>
              <button
                type="button"
                onClick={addInteraction}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
              >
                <AddIcon fontSize="small" />
                Add Interaction
              </button>
            </div>

            {interactions.length === 0 ? (
              <EmptyState>
                No interactions defined. Add interactions for client-side filtering, splitting, or sorting.
              </EmptyState>
            ) : (
              interactions.map((interaction, index) => {
                const typeConfig = INTERACTION_TYPES.find(t => t.value === interaction.type) || INTERACTION_TYPES[0];
                return (
                  <div key={index} className="p-3 border border-gray-200 rounded-lg space-y-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Interaction {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeInteraction(index)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Remove interaction"
                      >
                        <RemoveIcon fontSize="small" />
                      </button>
                    </div>

                    {/* Interaction Type Selector */}
                    <div className="relative">
                      <Select
                        aria-label="Type"
                        value={interaction.type}
                        options={INTERACTION_TYPES}
                        onChange={value => updateInteractionType(index, value)}
                      />
                      <label className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500">
                        Type
                      </label>
                    </div>

                    {/* Interaction Value */}
                    <RefTextArea
                      value={interaction.value}
                      onChange={value => updateInteractionValue(index, value)}
                      label={typeConfig.label}
                      allowedTypes={['model', 'dimension', 'metric']}
                      rows={2}
                      helperText={typeConfig.helperText}
                    />
                  </div>
                );
              })
            )}
          </SectionContainer>

          {/* Save Error */}
          {saveError && (
            <AlertContainer $type="error">
              <AlertText $type="error">{saveError}</AlertText>
            </AlertContainer>
          )}

          {/* Schema gate errors from the auto-save backbone (edit mode). The
              shared AlertContainer doesn't forward data-testid, so the testid
              lives on this wrapper div. */}
          {gateErrorText && (
            <div data-testid="insight-gate-errors">
              <AlertContainer $type="error">
                <AlertText $type="error">{gateErrorText}</AlertText>
              </AlertContainer>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Footer Actions */}
      <div className="border-t border-gray-200 bg-gray-50">
        {/* Delete Confirmation */}
        {showDeleteConfirm && isEditMode && (
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <p className="text-sm text-red-700 mb-2">
              {isNewObject
                ? 'Are you sure you want to delete this insight? This will discard your unsaved changes.'
                : 'Are you sure you want to delete this insight? This will mark it for deletion and remove it from YAML when you commit.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center px-4 py-3">
          <div className="flex gap-2">
            {/* Delete button - only in edit mode and not embedded */}
            {isEditMode && !showDeleteConfirm && !isEmbedded && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 text-red-600 hover:text-red-700 border border-red-300 hover:bg-red-50 rounded transition-colors"
                title="Delete insight"
              >
                <DeleteOutlineIcon fontSize="small" />
              </button>
            )}
          </div>

          {/* Edit mode auto-saves on every valid change through the unified
              backbone, so the footer shows a save-state indicator instead of a
              Save button. Create keeps the explicit Cancel/Save. */}
          {isAutoSave ? (
            <div className="flex items-center gap-2" data-testid="form-footer-autosave">
              <SaveStateIndicator status={autoSaveStatus} />
            </div>
          ) : (
            <div className="flex gap-2">
              <ButtonOutline type="button" onClick={onClose} className="text-sm">
                Cancel
              </ButtonOutline>
              <Button type="button" onClick={handleSave} disabled={saving} className="text-sm">
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
          )}
        </div>
      </div>

    </>
  );
};

export default InsightEditForm;
