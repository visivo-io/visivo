import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import RefTextArea from './RefTextArea';
import { SchemaEditor } from './SchemaEditor';
import { getSchema, CHART_TYPES, isSchemaLoaded, preloadSchemas } from '../../../schemas/schemas';
import { validateName } from './namedModel';
import { getTypeByValue } from './objectTypeConfigs';
import { isEmbeddedObject } from './embeddedObjectUtils';
import { BackNavigationButton } from '../../styled/BackNavigationButton';
import { getRequiredFields, getAllFieldNames } from './insightRequiredFields';
import InsightPreviewDashboard from './InsightPreviewDashboard';
import { useDebounce } from '../../../hooks/useDebounce';
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
 * - setPreviewContent: Function to set the preview content in parent
 */
const InsightEditForm = ({ insight, isCreate, onClose, onSave, onGoBack, isPreviewOpen, setIsPreviewOpen, setPreviewContent }) => {
  const { deleteInsightConfig, checkPublishStatus } = useStore();

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

  // Schema loading state
  const [currentSchema, setCurrentSchema] = useState(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState(null);


  const isEditMode = !!insight && !isCreate;
  const isNewObject = insight?.status === ObjectStatus.NEW;
  const isEmbedded = isEmbeddedObject(insight);
  const parentName = insight?._embedded?.parentName;
  const parentType = insight?._embedded?.parentType;

  // Debounce the values for preview updates
  const debouncedPropsType = useDebounce(propsType, 500);
  const debouncedPropsValues = useDebounce(propsValues, 500);
  const debouncedInteractions = useDebounce(interactions, 500);

  // Set preview content when values change
  useEffect(() => {
    if (setPreviewContent) {
      setPreviewContent(
        <InsightPreviewDashboard
            insightConfig={{
              name: name || '__preview__',
              props: {
                type: debouncedPropsType,
                ...debouncedPropsValues,
              },
              interactions: debouncedInteractions.map(i => {
                if (i.type === 'filter') return { filter: i.value };
                if (i.type === 'split') return { split: i.value };
                if (i.type === 'sort') return { sort: i.value };
                return {};
              }).filter(i => Object.keys(i).length > 0),
            }}
            projectId={useStore.getState().project?.id}
          />
      );
    }
  }, [setPreviewContent, name, debouncedPropsType, debouncedPropsValues, debouncedInteractions]);

  // Initialize form when insight changes
  useEffect(() => {
    if (insight) {
      // Edit mode - populate from existing insight
      setName(insight.name || '');

      const configToUse = insight.config;
      setDescription(configToUse?.description || '');

      // Props - extract type separately, rest goes to propsValues
      const props = configToUse?.props || {};
      const { type, ...restProps } = props;
      setPropsType(type || 'scatter');
      setPropsValues(restProps);

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
      setPropsType('scatter');
      setPropsValues({});
      setInteractions([]);
    }
    setErrors({});
    setSaveError(null);
  }, [insight, isCreate]);

  // Load schema when propsType changes
  useEffect(() => {
    const loadSchemaAsync = async () => {
      if (!propsType) return;

      // Check if already cached
      if (isSchemaLoaded(propsType)) {
        // Get from cache immediately
        const schema = await getSchema(propsType);
        setCurrentSchema(schema);
        return;
      }

      // Load schema asynchronously
      setSchemaLoading(true);
      setSchemaError(null);

      try {
        const schema = await getSchema(propsType);
        setCurrentSchema(schema);
      } catch (error) {
        console.error('Failed to load schema:', error);
        setSchemaError(`Failed to load schema for ${propsType}`);
        setCurrentSchema(null);
      } finally {
        setSchemaLoading(false);
      }
    };

    loadSchemaAsync();
  }, [propsType]);

  // Preload common schemas on mount for better performance
  useEffect(() => {
    // Preload the most common chart types
    const commonTypes = ['scatter', 'bar', 'pie', 'heatmap', 'histogram'];
    preloadSchemas(commonTypes).catch(console.error);
  }, []);

  const validateForm = () => {
    const newErrors = {};

    // Skip name validation for embedded insights (they don't require names)
    if (!isEmbedded) {
      const nameError = validateName(name);
      if (nameError) {
        newErrors.name = nameError;
      }
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

    // Build props object - combine type with schema-driven values
    const props = {
      type: propsType,
      ...propsValues,
    };

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

            {/* Chart Type selector */}
            <div className="relative">
              <select
                id="propsType"
                value={propsType}
                onChange={e => setPropsType(e.target.value)}
                className={`block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${errors.propsType ? 'border-red-500' : 'border-gray-300'}`}
              >
                {CHART_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <label
                htmlFor="propsType"
                className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
              >
                Chart Type<span className="text-red-500 ml-0.5">*</span>
              </label>
              {errors.propsType && <p className="mt-1 text-xs text-red-500">{errors.propsType}</p>}
            </div>

            {/* Required fields for this chart type */}
            {(() => {
              const requiredFields = getRequiredFields(propsType);
              if (requiredFields.length > 0) {
                return (
                  <div className="space-y-4 mt-4">
                    <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                      Required Data Fields
                    </div>
                    {requiredFields.map(field => (
                      <div key={field.name} className="relative">
                        <RefTextArea
                          id={`prop-${field.name}`}
                          value={propsValues[field.name] || ''}
                          onChange={value => setPropsValues(prev => ({
                            ...prev,
                            [field.name]: value
                          }))}
                          placeholder={field.placeholder || ' '}
                          rows={1}
                          className={`block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border ${
                            errors[`prop.${field.name}`] ? 'border-red-500' : 'border-gray-300'
                          } appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 peer placeholder-transparent resize-y`}
                        />
                        <label
                          htmlFor={`prop-${field.name}`}
                          className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-3 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 text-gray-500 peer-focus:text-primary-500"
                        >
                          {field.label}
                          {!field.optional && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        {field.description && (
                          <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                        )}
                        {errors[`prop.${field.name}`] && (
                          <p className="mt-1 text-xs text-red-500">{errors[`prop.${field.name}`]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })()}

            {/* Additional optional props from schema */}
            {schemaLoading ? (
              <div className="flex items-center justify-center py-8">
                <CircularProgress size={24} />
                <span className="ml-2 text-sm text-gray-600">Loading schema...</span>
              </div>
            ) : schemaError ? (
              <AlertContainer $type="error">
                <AlertText>{schemaError}</AlertText>
              </AlertContainer>
            ) : currentSchema ? (
              <div className="mt-4">
                <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">
                  Additional Properties
                </div>
                <SchemaEditor
                  schema={currentSchema}
                  value={propsValues}
                  onChange={setPropsValues}
                  excludeProperties={['type', ...getAllFieldNames(propsType)]}
                />
              </div>
            ) : (
              <EmptyState>
                Select a chart type to configure properties
              </EmptyState>
            )}
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
                      <select
                        value={interaction.type}
                        onChange={e => updateInteractionType(index, e.target.value)}
                        className="block w-full px-3 py-2 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        {INTERACTION_TYPES.map(t => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
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
                : 'Are you sure you want to delete this insight? This will mark it for deletion and remove it from YAML when you publish.'}
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
        </div>
      </div>

    </>
  );
};

export default InsightEditForm;
