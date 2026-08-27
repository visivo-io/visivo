import React, { useState, useEffect, useCallback } from 'react';
import useFormBaseline from '../../../hooks/useFormBaseline';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import RefTextArea from './RefTextArea';
import Select from '../../common/Select';
import InsightEditFormFields from './InsightEditFormFields';
import { validateName } from './namedModel';
import { getTypeByValue } from './objectTypeConfigs';
import { isEmbeddedObject } from './embeddedObjectUtils';
import { BackNavigationButton } from '../../styled/BackNavigationButton';
import { useDebounce } from '../../../hooks/useDebounce';
import { refKindsFor } from './fieldTypes';
import { REF_INSERT_HINT } from './RefTextArea';
import {
  SectionContainer,
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
 */
const InsightEditForm = ({ insight, isCreate, onClose, onSave, onGoBack, isPreviewOpen, setIsPreviewOpen, setPreviewConfig, onDirtyChange }) => {
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

  // Initialize form when insight changes
  // VIS-1133: the saved insight, as form state.
  const applyValues = useCallback(values => {
    setName(values.name);
    setDescription(values.description);
    setProps(values.props);
    setInteractions(values.interactions);
  }, []);
  // Per-object drafts: unsaved edits survive navigating away and reloads.
  // Embedded insights have no standalone identity, so they opt out.
  const draftKey =
    isEditMode && !isEmbedded && insight?.name ? `insight:${insight.name}` : undefined;
  const { seed, discard, isDirtyAgainst } = useFormBaseline(applyValues, draftKey);

  useEffect(() => {
    if (insight) {
      const configToUse = insight.config;
      const insightInteractions = configToUse?.interactions || [];
      seed({
        name: insight.name || '',
        description: configToUse?.description || '',
        // The full Plotly props object (carries `.type`).
        props: configToUse?.props || { type: 'scatter' },
        // Each interaction carries exactly one of filter / split / sort.
        interactions: insightInteractions.map(i => {
          if (i.filter) return { type: 'filter', value: i.filter };
          if (i.split) return { type: 'split', value: i.split };
          if (i.sort) return { type: 'sort', value: i.sort };
          return { type: 'filter', value: '' }; // Default
        }),
      });
    } else if (isCreate) {
      seed({ name: '', description: '', props: { type: 'scatter' }, interactions: [] });
    }
    setErrors({});
    setSaveError(null);
    // Re-seeding on `seed` would wipe the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight, isCreate]);

  const dirty = isDirtyAgainst({ name, description, props, interactions });

  // Report upward so the tab strip's unsaved dot and its guarded close reflect
  // real edits (VIS-1133) — the rail clears it on unmount.
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

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
    const config = isEmbedded
      ? { props }
      : { name, props };

    // Only include description if non-empty
    if (description) {
      config.description = description;
    }

    // Only include interactions if non-empty
    const nonEmptyInteractions = interactions
      .filter(i => i.value && i.value.trim())
      .map(i => ({ [i.type]: i.value }));

    if (nonEmptyInteractions.length > 0) {
      config.interactions = nonEmptyInteractions;
    }

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
      // Optional: the right rail supplies it to close the tab, a modal host
      // to dismiss itself. Calling it unguarded threw when neither did.
      onClose?.();
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

          {/* Basic Information + Visualization Props — the shared inner panel
              (VIS-1224), also rendered by the Explorer's InsightBuildSection so
              both surfaces show the same edit form. Name is a plain live-edit
              field here (persisted on Save); disabled in edit mode. */}
          <InsightEditFormFields
            showName={!isEmbedded}
            nameId="insightName"
            nameValue={name}
            onNameChange={e => setName(e.target.value)}
            nameDisabled={isEditMode}
            nameError={errors.name}
            showDescription
            description={description}
            onDescriptionChange={e => setDescription(e.target.value)}
            ownerName={name || 'insight'}
            props={props}
            onPropsChange={setProps}
            onValidityChange={ok => setPropsValid(ok)}
            propsError={errors.props}
            propsTypeError={errors.propsType}
          />

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
                      allowedTypes={refKindsFor('interaction', 'filter')}
                      rows={2}
                      helperText={`${typeConfig.helperText} ${REF_INSERT_HINT}`}
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

          <div className="flex gap-2">
            {/* VIS-1133: no modal to close in the rail, so this reverts to the
                last saved values. Create mode (modal hosts) keeps Cancel. */}
            <ButtonOutline
              type="button"
              onClick={isEditMode ? discard : onClose}
              disabled={isEditMode && (!dirty || saving || deleting)}
              data-testid="insight-form-discard"
              className="text-sm"
            >
              {isEditMode ? 'Discard' : 'Cancel'}
            </ButtonOutline>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || (isEditMode && !dirty)}
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
      </div>

    </>
  );
};

export default InsightEditForm;
