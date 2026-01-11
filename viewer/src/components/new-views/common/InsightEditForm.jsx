import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import RefTextArea from './RefTextArea';
import { SchemaEditor } from './SchemaEditor';
import { getSchema, CHART_TYPES } from '../../../schemas';
import {
  FormInput,
  FormTextarea,
  FormSelect,
  FormFooter,
  FormAlert,
  FormSection,
  FormLayout,
} from '../../styled/FormComponents';
import { validateName } from './namedModel';

/**
 * InsightEditForm - Form component for editing/creating insights
 *
 * Insights define visualization properties (props) and client-side interactions.
 *
 * Props:
 * - insight: Insight object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 */
const InsightEditForm = ({ insight, isCreate, onClose, onSave }) => {
  const { saveInsightConfig, deleteInsightConfig, checkPublishStatus } = useStore();

  // Form state - Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Props state - chart type and schema-driven props
  const [propsType, setPropsType] = useState('scatter');
  const [propsValues, setPropsValues] = useState({});

  // Interactions state - array of {type: 'filter'|'split'|'sort', value: string}
  const [interactions, setInteractions] = useState([]);

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!insight && !isCreate;
  const isNewObject = insight?.status === ObjectStatus.NEW;

  // Get the current schema for the selected chart type
  const currentSchema = getSchema(propsType);

  // Initialize form when insight changes
  useEffect(() => {
    if (insight) {
      // Edit mode - populate from existing insight
      setName(insight.name || '');
      setDescription(insight.config?.description || '');

      // Props - extract type separately, rest goes to propsValues
      const props = insight.config?.props || {};
      const { type, ...restProps } = props;
      setPropsType(type || 'scatter');
      setPropsValues(restProps);

      // Interactions - each interaction has only one type (filter, split, or sort)
      const insightInteractions = insight.config?.interactions || [];
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
      setPropsType('scatter');
      setPropsValues({});
      setInteractions([]);
    }
    setErrors({});
    setSaveError(null);
  }, [insight, isCreate]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (!propsType) {
      newErrors.propsType = 'Chart type is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    try {
      // Build props object - combine type with schema-driven values
      const props = {
        type: propsType,
        ...propsValues,
      };

      // Build config object
      const config = {
        name,
        props,
      };

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

      const result = await saveInsightConfig(name, config);

      if (result?.success) {
        onSave && onSave(config);
        onClose();
      } else {
        setSaveError(result?.error || 'Failed to save insight');
      }
    } catch (error) {
      setSaveError(error.message || 'Failed to save insight');
    }

    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteInsightConfig(insight.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
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
      <FormLayout className="space-y-6">
        {/* Basic Fields Section */}
        <div className="space-y-4">
          <FormSection title="Basic Information" />

          <FormInput
            id="insightName"
            label="Insight Name"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isEditMode}
            required
            error={errors.name}
          />

          <FormTextarea
            id="insightDescription"
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        {/* Props Section */}
        <div className="space-y-4">
          <FormSection title="Visualization Props" />

          <FormSelect
            id="propsType"
            label="Chart Type"
            value={propsType}
            onChange={e => setPropsType(e.target.value)}
            required
            error={errors.propsType}
          >
            {CHART_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </FormSelect>

          {/* Schema-driven props editor */}
          {currentSchema && (
            <SchemaEditor
              schema={currentSchema}
              value={propsValues}
              onChange={setPropsValues}
              excludeProperties={['type']}
            />
          )}
        </div>

        {/* Interactions Section */}
        <div className="space-y-4">
          <FormSection
            title="Interactions"
            action={
              <button
                type="button"
                onClick={addInteraction}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
              >
                <AddIcon fontSize="small" />
                Add Interaction
              </button>
            }
          />

          {interactions.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No interactions defined. Add interactions for client-side filtering, splitting, or sorting.
            </p>
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

                  <FormSelect
                    id={`interaction-type-${index}`}
                    label="Type"
                    value={interaction.type}
                    onChange={e => updateInteractionType(index, e.target.value)}
                  >
                    {INTERACTION_TYPES.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </FormSelect>

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
        </div>

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
      </FormLayout>

      <FormFooter
        onCancel={onClose}
        onSave={handleSave}
        saving={saving}
        showDelete={isEditMode && !showDeleteConfirm}
        onDeleteClick={() => setShowDeleteConfirm(true)}
        deleteConfirm={
          showDeleteConfirm && isEditMode
            ? {
                show: true,
                message: isNewObject
                  ? 'Are you sure you want to delete this insight? This will discard your unsaved changes.'
                  : 'Are you sure you want to delete this insight? This will mark it for deletion and remove it from YAML when you publish.',
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

export default InsightEditForm;
