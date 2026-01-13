import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import RefTextArea from './RefTextArea';
import {
  FormInput,
  FormSelect,
  FormFooter,
  FormAlert,
  FormCheckbox,
  FormLayout,
} from '../../styled/FormComponents';
import { validateName } from './namedModel';

/**
 * RelationEditForm - Form component for editing/creating relations
 *
 * Relations define how two models can be joined together. The models involved
 * are inferred from the condition using ${ref(model).field} syntax.
 *
 * Props:
 * - relation: Relation object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 */
const RelationEditForm = ({ relation, isCreate, onClose, onSave }) => {
  const { saveRelation, deleteRelation, checkPublishStatus } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [joinType, setJoinType] = useState('inner');
  const [condition, setCondition] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!relation && !isCreate;
  const isNewObject = relation?.status === ObjectStatus.NEW;

  // Initialize form when relation changes
  useEffect(() => {
    if (relation) {
      // Edit mode - populate from existing relation
      setName(relation.name || '');
      setJoinType(relation.config?.join_type || 'inner');
      setCondition(relation.config?.condition || '');
      setIsDefault(relation.config?.is_default || false);
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setJoinType('inner');
      setCondition('');
      setIsDefault(false);
    }
    setErrors({});
    setSaveError(null);
  }, [relation, isCreate]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
    }

    if (!condition.trim()) {
      newErrors.condition = 'Condition is required';
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
      join_type: joinType,
      condition,
      is_default: isDefault || undefined,
    };

    const result = await saveRelation(name, config);

    setSaving(false);

    if (result?.success) {
      onSave && onSave(config);
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to save relation');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteRelation(relation.name);
    setDeleting(false);

    if (result?.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result?.error || 'Failed to delete relation');
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <FormLayout>
        <FormInput
          id="relationName"
          label="Relation Name"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={isEditMode}
          required
          error={errors.name}
        />

        <FormSelect
          id="joinType"
          label="Join Type"
          value={joinType}
          onChange={e => setJoinType(e.target.value)}
        >
          <option value="inner">Inner Join</option>
          <option value="left">Left Join</option>
          <option value="right">Right Join</option>
          <option value="full">Full Join</option>
        </FormSelect>

        <RefTextArea
          value={condition}
          onChange={setCondition}
          label="Condition"
          required
          error={errors.condition}
          allowedTypes={['model']}
          rows={4}
          /* eslint-disable-next-line no-template-curly-in-string */
          helperText="Join condition using ${ref(model).field} syntax. Must reference at least two models."
        />

        <FormCheckbox
          id="isDefault"
          label="Default relation for these models"
          checked={isDefault}
          onChange={e => setIsDefault(e.target.checked)}
        />

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
                  ? 'Are you sure you want to delete this relation? This will discard your unsaved changes.'
                  : 'Are you sure you want to delete this relation? This will mark it for deletion and remove it from YAML when you publish.',
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

export default RelationEditForm;
