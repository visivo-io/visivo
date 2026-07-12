import React, { useState, useEffect, useRef } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { ButtonOutline } from '../../styled/Button';
import SourceTypeSelector from '../../sources/SourceTypeSelector';
import SourceFormGenerator, { getSourceSchema } from '../../sources/SourceFormGenerator';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
  FormInput,
  FormFooter,
  FormAlert,
  FormLayout,
} from '../../styled/FormComponents';
import { validateName } from './namedModel';
import { getTypeByValue } from './objectTypeConfigs';
import { isEmbeddedObject } from './embeddedObjectUtils';
import { BackNavigationButton } from '../../styled/BackNavigationButton';
import useRecordSave from '../../../hooks/useRecordSave';
import SaveStateIndicator from '../workspace/SaveStateIndicator';

/**
 * SourceEditForm - Form component for editing/creating sources
 *
 * Props:
 * - source: Source object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Function(type, name, config) - Unified save callback
 * - onGoBack: Callback to navigate back to parent (for embedded sources)
 *
 * VIS-1018: a STANDALONE source in edit mode auto-saves through the unified
 * `useRecordSave('source', …)` backbone — each field change debounces and
 * persists only if the config passes schema validation, so the footer shows a
 * save-state indicator instead of a Save button. CREATE mode keeps its explicit
 * Save button (the record isn't in the store yet), and EMBEDDED sources keep it
 * too: they have no name to key the backbone on and route through the parent's
 * `onSave`/applyToParent, so their save can't go through the name-keyed backbone.
 */
const SourceEditForm = ({ source, isCreate, onClose, onSave, onGoBack }) => {
  const { deleteSource, testConnection, connectionStatus, clearConnectionStatus, checkCommitStatus } =
    useStore();

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [formValues, setFormValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!source && !isCreate;
  const isNewObject = source?.status === ObjectStatus.NEW;
  const isEmbedded = isEmbeddedObject(source);
  const parentName = source?._embedded?.parentName;

  // Edit mode auto-saves through the unified backbone (VIS-1018); create mode
  // keeps an explicit Save button, and embedded sources do too — they have no
  // name to key the name-scoped backbone on and save via the parent instead.
  const isAutoSave = isEditMode && !isEmbedded;

  // Unified optimistic + debounced + schema-validated save backbone (VIS-1018).
  // scheduleSave writes the config optimistically into the source store, then
  // debounce-persists ONLY if it passes schema validation; otherwise it reports
  // status:'invalid' with per-field gate errors and persists nothing.
  const {
    scheduleSave,
    status: autoSaveStatus,
    errors: gateErrors,
  } = useRecordSave('source', source?.name || null);

  const gateErrorText =
    gateErrors && gateErrors.length > 0
      ? gateErrors.map(e => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ')
      : null;

  // Build the source config from the current form state (shared by the manual
  // create-mode save and the debounced auto-save path). Embedded sources omit
  // the name (they're keyed by their position in the parent config).
  const buildConfig = () =>
    isEmbedded
      ? { type: sourceType, ...formValues }
      : { name, type: sourceType, ...formValues };

  // Set true once the form has hydrated from `source`, so the auto-save effect
  // below never fires on hydration (only on real user edits). Keyed on the
  // source NAME (not identity), so an optimistic-save refetch doesn't re-hydrate
  // and clobber in-progress edits.
  const hydratedRef = useRef(false);
  useEffect(() => {
    hydratedRef.current = false;
    if (source) {
      // Edit mode - populate from existing source
      setName(source.name || '');

      const configToUse = source.config;

      // Extract form values from the config object
      if (configToUse) {
        setSourceType(configToUse.type || '');
        const { name: _, type: __, ...formProps } = configToUse;
        setFormValues(formProps);
      } else {
        // Fallback for flat source objects — restore the type from the flat
        // object too, otherwise a config-less source renders the "select a
        // source type" placeholder instead of its connection fields.
        setSourceType(source.type || '');
        const { name: _, type: __, status: ___, config: ____, _embedded: _____, ...formProps } = source;
        setFormValues(formProps);
      }
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setSourceType('');
      setFormValues({});
    }
    setErrors({});
    setSaveError(null);
    // Defer past the state-set renders so their auto-save effect runs while
    // still un-hydrated (mirrors ModelEditForm).
    const id = setTimeout(() => {
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.name, isCreate]);

  // Auto-save: whenever an editable field changes (post-hydration), schedule a
  // save once the local minimums (name + type) are present. The schema gate in
  // scheduleSave still decides whether it actually persists.
  useEffect(() => {
    if (!isAutoSave || !hydratedRef.current) return;
    if (!name.trim() || !sourceType) return;
    scheduleSave(buildConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, sourceType, formValues]);

  // Clear connection status when panel closes
  useEffect(() => {
    return () => {
      if (name) {
        clearConnectionStatus(name);
      }
    };
  }, [name, clearConnectionStatus]);

  const validateForm = () => {
    const newErrors = {};

    // Skip name validation for embedded sources (they don't have names)
    if (!isEmbedded) {
      const nameError = validateName(name);
      if (nameError) {
        newErrors.name = nameError;
      }
    }

    if (!sourceType) {
      newErrors.type = 'Source type is required';
    }

    // Validate required fields based on schema
    const schema = getSourceSchema(sourceType);
    schema.fields.forEach(field => {
      if (field.required && !formValues[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateForm()) return;

    const config = {
      name,
      type: sourceType,
      ...formValues,
    };

    await testConnection(config);
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    // Build config - embedded sources don't include name
    const config = buildConfig();

    // Call unified save - parent handles embedded vs standalone routing
    const result = await onSave('source', name, config);

    setSaving(false);

    if (!result?.success) {
      setSaveError(result?.error || 'Failed to save source');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteSource(source.name);
    setDeleting(false);

    if (result.success) {
      await checkCommitStatus();
      onClose();
    } else {
      setSaveError(result.error || 'Failed to delete source');
      setShowDeleteConfirm(false);
    }
  };

  const currentConnectionStatus = connectionStatus[name || 'new'];

  return (
    <>
      <FormLayout>
        {/* Embedded source back navigation */}
        {isEmbedded && onGoBack && (
          <BackNavigationButton
            onClick={onGoBack}
            typeConfig={getTypeByValue('model')}
            label="Model"
            name={parentName}
          />
        )}

        {/* Name field - hidden for embedded sources */}
        {!isEmbedded && (
          <FormInput
            id="sourceName"
            label="Source Name"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isEditMode}
            required
            error={errors.name}
          />
        )}

          {/* Source Type Selector */}
          <div>
            <SourceTypeSelector
              value={sourceType}
              onChange={type => {
                setSourceType(type);
                setFormValues({}); // Reset form values when type changes
              }}
              disabled={isEditMode}
            />
            {errors.type && <p className="mt-1 text-xs text-red-500">{errors.type}</p>}
          </div>

          {/* Dynamic Form Fields */}
          <SourceFormGenerator
            sourceType={sourceType}
            values={formValues}
            onChange={setFormValues}
            errors={errors}
          />

          {/* Connection Status */}
          {currentConnectionStatus && (
            <div
              className={`
            flex items-center gap-2 p-3 rounded-md text-sm
            ${
              currentConnectionStatus.status === 'connected'
                ? 'bg-green-50 text-green-700'
                : currentConnectionStatus.status === 'testing'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-700'
            }
          `}
            >
              {currentConnectionStatus.status === 'testing' && (
                <>
                  <CircularProgress size={16} />
                  <span>Testing connection...</span>
                </>
              )}
              {currentConnectionStatus.status === 'connected' && (
                <>
                  <CheckCircleIcon fontSize="small" />
                  <span>Connection successful</span>
                </>
              )}
              {currentConnectionStatus.status === 'failed' && (
                <>
                  <ErrorOutlineIcon fontSize="small" />
                  <span>Connection failed: {currentConnectionStatus.error}</span>
                </>
              )}
            </div>
          )}

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
        {gateErrorText && (
          <div data-testid="source-gate-errors">
            <FormAlert variant="error">{gateErrorText}</FormAlert>
          </div>
        )}
      </FormLayout>

      <FormFooter
        onCancel={onClose}
        onSave={handleSave}
        saving={saving}
        showDelete={isEditMode && !showDeleteConfirm && !isEmbedded}
        onDeleteClick={() => setShowDeleteConfirm(true)}
        deleteConfirm={
          showDeleteConfirm && isEditMode && !isEmbedded
            ? {
                show: true,
                message: isNewObject
                  ? 'Are you sure you want to delete this source? This will discard your unsaved changes.'
                  : 'Are you sure you want to delete this source? This will mark it for deletion and remove it from YAML when you commit.',
                onConfirm: handleDelete,
                onCancel: () => setShowDeleteConfirm(false),
                deleting,
              }
            : null
        }
        autoSave={isAutoSave}
        rightContent={isAutoSave ? <SaveStateIndicator status={autoSaveStatus} /> : null}
        leftActions={
          <ButtonOutline
            type="button"
            onClick={handleTestConnection}
            disabled={!sourceType || currentConnectionStatus?.status === 'testing'}
            className="text-sm"
          >
            Test Connection
          </ButtonOutline>
        }
      />
    </>
  );
};

export default SourceEditForm;
