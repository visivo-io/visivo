import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import useRecordSave from '../../../hooks/useRecordSave';
import SaveStateIndicator from '../workspace/SaveStateIndicator';
import RefTextArea from './RefTextArea';
import Select from '../../common/Select';
import {
  FormInput,
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
  const { saveRelation, deleteRelation, checkCommitStatus } = useStore();

  // VIS-993: edit mode is AUTO-SAVE — every field change debounces through
  // the gated optimistic backbone (no Save button); gate errors render live
  // on the fields. Create mode keeps the explicit button: the record isn't
  // in the collection yet.
  const {
    scheduleSave,
    status: autoSaveStatus,
    errors: gateErrors,
  } = useRecordSave('relation', relation?.name || null);

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

  const buildConfig = (over = {}) => ({
    name,
    join_type: joinType,
    condition,
    is_default: isDefault || undefined,
    ...over,
  });

  const isAutoSave = isEditMode;
  const autoSave = over => {
    if (!isAutoSave) return;
    scheduleSave(buildConfig(over));
  };

  const gateConditionError = gateErrors?.find(
    e => e.path === 'condition' || e.path?.startsWith('condition')
  )?.message;
  const gateOtherErrors = (gateErrors || []).filter(
    e => !(e.path === 'condition' || e.path?.startsWith('condition'))
  );

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

    // Create mode only — edit mode auto-saves via scheduleSave.
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
      await checkCommitStatus();
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

        <div className="relative">
          <Select
            id="joinType"
            aria-label="Join Type"
            value={joinType}
            onChange={v => {
              setJoinType(v);
              autoSave({ join_type: v });
            }}
          >
            <option value="inner">Inner Join</option>
            <option value="left">Left Join</option>
            <option value="right">Right Join</option>
            <option value="full">Full Join</option>
          </Select>
          <label
            htmlFor="joinType"
            className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 text-gray-500"
          >
            Join Type
          </label>
        </div>

        <RefTextArea
          value={condition}
          onChange={v => {
            setCondition(v);
            autoSave({ condition: v });
          }}
          label="Condition"
          required
          error={errors.condition || gateConditionError}
          allowedTypes={['model']}
          rows={4}
          /* eslint-disable-next-line no-template-curly-in-string */
          helperText="Join condition using ${ref(model).field} syntax. Must reference at least two models."
        />

        <FormCheckbox
          id="isDefault"
          label="Default relation for these models"
          checked={isDefault}
          onChange={e => {
            setIsDefault(e.target.checked);
            autoSave({ is_default: e.target.checked || undefined });
          }}
        />

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
        {gateOtherErrors.length > 0 && (
          <FormAlert variant="error">
            {gateOtherErrors.map(e => `${e.path}: ${e.message}`).join('; ')}
          </FormAlert>
        )}
      </FormLayout>

      <FormFooter
        autoSave={isAutoSave}
        rightContent={<SaveStateIndicator status={autoSaveStatus} />}
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
                  : 'Are you sure you want to delete this relation? This will mark it for deletion and remove it from YAML when you commit.',
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
