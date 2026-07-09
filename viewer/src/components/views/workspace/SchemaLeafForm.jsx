import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import useRecordSave from '../../../hooks/useRecordSave';
import SaveStateIndicator from './SaveStateIndicator';
import { FormInput, FormFooter, FormLayout, FormAlert } from '../../styled/FormComponents';
import RefTextArea from '../common/RefTextArea';
import { validateName } from '../common/namedModel';
import { isEmbeddedObject } from '../common/embeddedObjectUtils';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { BackNavigationButton } from '../../styled/BackNavigationButton';
import { FormShell } from './FormShell';
import { SAVE_ACTION, DELETE_ACTION } from './collectionKeys';
import { unwrapConfig } from './unwrapRecordConfig';
import { getObjectSchemaSync } from '../../../schemas/projectSchema';
import { useFieldParentModel } from './fields/useFieldParentModel';

/**
 * SchemaLeafForm (VIS-996) — the generic schema-driven leaf edit form.
 *
 * Replaces the bespoke per-object `*EditForm.jsx` components: the FIELD SET
 * (names, types, enums, required, defaults, descriptions) comes from the
 * published `visivo_project_schema.json` `$defs` slice via the VIS-991 engine
 * (FormShell → buildGroupSpec → FieldGroupList), so the viewer can never drift
 * from the backend Pydantic models. What stays per-type is a thin declarative
 * layer below (TYPE_CONFIG): richer widget overrides the schema can't express
 * (RefTextArea for SQL expressions with per-type ref `allowedTypes`) and the
 * embedded-mode ref restriction.
 *
 * The chrome the bespoke forms each hand-rolled is owned ONCE here:
 *   - name identity input (read-only in edit mode, validateName on create)
 *   - create mode: explicit Save via the store's SAVE_ACTION[type]
 *   - edit mode: auto-save through the gated useRecordSave backbone (VIS-993) —
 *     no Save button; SaveStateIndicator reports the debounce
 *   - embedded mode (inline object within a model): back-nav + delegating
 *     `onSave(type, name, config)` contract, plain-SQL-only expressions
 *   - delete with confirm (DELETE_ACTION[type]) incl. the NEW-object
 *     discard-unsaved messaging
 *   - validation-gate errors: field-path errors land inline on their widget,
 *     anything unmapped falls to the form-level alert
 *
 * Prop contract matches the rail's INLINE_LEAF_FORMS `common` shape:
 * `{ record, isCreate, onClose, onSave, onGoBack }` (+ `type`).
 */

/**
 * Per-type declarative layer. `expressionField` names the schema field that
 * should render through RefTextArea instead of the generic engine widget;
 * `allowedTypes` scopes its + ref-insert menu; `helperText`/`embeddedHelperText`
 * carry the authoring guidance the schema description doesn't.
 */
export const TYPE_CONFIG = {
  dimension: {
    expressionField: 'expression',
    expressionLabel: 'Expression',
    allowedTypes: ['model', 'dimension'],
    helperText: 'SQL expression for this dimension. Use the + button to insert references.',
    embeddedHelperText: 'Plain SQL expression referencing columns from the parent model.',
    rows: 4,
  },
  metric: {
    expressionField: 'expression',
    expressionLabel: 'Expression',
    allowedTypes: ['model', 'metric', 'dimension'],
    helperText: 'SQL aggregate expression for this metric. Use the + button to insert references.',
    embeddedHelperText: 'Plain SQL aggregate expression over the parent model.',
    rows: 4,
  },
  relation: {
    expressionField: 'condition',
    expressionLabel: 'Condition',
    allowedTypes: ['model'],
    // eslint-disable-next-line no-template-curly-in-string
    helperText: 'Join condition using ${ref(model).field} syntax. Must reference at least two models.',
    rows: 4,
  },
};

/** Fields the host renders as chrome — withheld from the generated groups. */
const CHROME_FIELDS = ['name'];

const REF_PATTERN = /\$\{\s*ref\s*\(/;

/** Title-case a schema field name for messages ('join_type' → 'Join type'). */
const fieldLabel = (schema, name) =>
  schema?.properties?.[name]?.title ||
  name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');

const SchemaLeafForm = ({ type, record, isCreate = false, onClose, onSave, onGoBack }) => {
  const store = useStore();
  const checkCommitStatus = store.checkCommitStatus;

  const isEmbedded = isEmbeddedObject(record);
  const parentName = record?._embedded?.parentName;
  const isEditMode = !!record && !isCreate && !isEmbedded;
  const isNewObject = record?.status === ObjectStatus.NEW;
  const typeConfig = TYPE_CONFIG[type] || {};

  // ONE config object — the record's live config, not per-field useState
  // mirrors (the §0.6 data-layer rule from VIS-1018).
  const [config, setConfig] = useState({});
  const [localErrors, setLocalErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const recordName = record?.config?.name || record?.name || '';

  // Resolve the record's source SQL dialect so the expression parse gate
  // (VIS-993) validates source-authored SQL under the right dialect rather than
  // defaulting to duckdb (which false-rejects e.g. Snowflake path syntax). The
  // dimension/metric's parent model resolves the source; an unresolved or duckdb
  // source yields undefined (backend default), a no-op change.
  const { sourceName } = useFieldParentModel(record);
  const sourceDialect = useMemo(() => {
    if (!sourceName || !Array.isArray(store.sources)) return undefined;
    const src = store.sources.find(s => s.name === sourceName || s.source_name === sourceName);
    const t = (src?.type || src?.config?.type || '').toLowerCase();
    if (!t || t === 'duckdb') return undefined;
    return t === 'postgresql' ? 'postgres' : t;
  }, [sourceName, store.sources]);

  // VIS-993: edit mode is AUTO-SAVE through the gated optimistic backbone.
  const {
    scheduleSave,
    status: autoSaveStatus,
    errors: gateErrors,
  } = useRecordSave(type, isEditMode ? recordName || null : null, { sourceDialect });

  useEffect(() => {
    if (record) {
      const cfg = unwrapConfig(record) || {};
      // Embedded records keep their identity in config.name; standalone records
      // may only carry it at the record level.
      setConfig({ ...cfg, name: cfg.name || record.name || '' });
    } else {
      setConfig({});
    }
    setLocalErrors({});
    setSaveError(null);
    // Re-seed only when the record IDENTITY (or mode) changes — not on every
    // optimistic store write our own scheduleSave round-trips back in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordName, isCreate, type]);

  const name = config.name || '';

  const applyChange = useCallback(
    nextConfig => {
      setConfig(nextConfig);
      if (isEditMode) {
        // Auto-save; the gate (schema + refs + expressions) decides persistence.
        const { name: _n, ...body } = nextConfig;
        scheduleSave({ name: recordName, ...body });
      }
    },
    [isEditMode, scheduleSave, recordName]
  );

  // ---- validation (create/embedded save path; edit mode is gate-driven) ----
  // FormShell warms the per-type schema cache on mount, so a sync read at
  // save-click time is race-free (and null-safe before the first load).
  const validateForm = () => {
    const schemaForValidation = getObjectSchemaSync(type);
    const errs = {};
    if (!isEmbedded) {
      const nameError = validateName(name);
      if (nameError) errs.name = nameError;
    }
    const required = schemaForValidation?.required || [];
    required.forEach(f => {
      const v = config[f];
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
        errs[f] = `${fieldLabel(schemaForValidation, f)} is required`;
      }
    });
    // Embedded (inline) expressions cannot contain ref() — plain SQL only.
    const exprField = typeConfig.expressionField;
    if (isEmbedded && exprField && REF_PATTERN.test(config[exprField] || '')) {
      errs[exprField] =
        `Inline ${type}s cannot use ref() expressions. Use plain SQL referencing fields from the parent model.`;
    }
    setLocalErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---- save / delete ----
  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    setSaveError(null);
    const body = { ...config, name };
    try {
      if (isEmbedded) {
        // Embedded object — delegate; the parent applies it via its edit stack.
        const result = await onSave(type, name, body);
        setSaving(false);
        if (!result?.success) setSaveError(result?.error || `Failed to save ${type}`);
      } else {
        // Create mode — persist through the type's store action.
        const saveAction = store[SAVE_ACTION[type]];
        const result = await saveAction(name, body);
        setSaving(false);
        if (result?.success) {
          onSave && onSave(body);
          onClose && onClose();
        } else {
          setSaveError(result?.error || `Failed to save ${type}`);
        }
      }
    } catch (error) {
      setSaveError(error.message || `Failed to save ${type}`);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const deleteAction = store[DELETE_ACTION[type]];
    const result = await deleteAction(record.name);
    setDeleting(false);
    if (result?.success) {
      await checkCommitStatus();
      onClose && onClose();
    } else {
      setSaveError(result?.error || `Failed to delete ${type}`);
      setShowDeleteConfirm(false);
    }
  };

  // ---- gate errors → field map + form-level leftovers ----
  const { fieldErrors, formLevelGateErrors } = useMemo(() => {
    const map = {};
    const rest = [];
    (gateErrors || []).forEach(e => {
      const seg = (e.path || '').split(/[./]/)[0];
      if (seg) {
        if (!map[seg]) map[seg] = e.message;
      } else {
        rest.push(e);
      }
    });
    return { fieldErrors: map, formLevelGateErrors: rest };
  }, [gateErrors]);

  const mergedErrors = { ...fieldErrors, ...localErrors };

  // ---- expression widget override (RefTextArea) ----
  const overrides = useMemo(() => {
    const exprField = typeConfig.expressionField;
    if (!exprField) return {};
    return {
      [exprField]: ({ value, onChange, error }) => (
        <RefTextArea
          value={value ?? ''}
          onChange={onChange}
          label={
            typeConfig.expressionLabel || fieldLabel(getObjectSchemaSync(type), exprField)
          }
          required
          error={error}
          allowedTypes={isEmbedded ? [] : typeConfig.allowedTypes || []}
          hideAddButton={isEmbedded}
          rows={typeConfig.rows || 4}
          helperText={
            isEmbedded && typeConfig.embeddedHelperText
              ? typeConfig.embeddedHelperText
              : typeConfig.helperText
          }
        />
      ),
    };
    // typeConfig is a stable module-level object per type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, isEmbedded]);

  const typeDef = getTypeByValue(type);
  const singular = typeDef?.singularLabel || type;

  return (
    <>
      <FormLayout>
        {isEmbedded && onGoBack && (
          <BackNavigationButton
            onClick={onGoBack}
            typeConfig={getTypeByValue('model')}
            label="Model"
            name={parentName}
          />
        )}

        {!isEmbedded && (
          <FormInput
            id="schemaLeafFormName"
            label={`${singular.charAt(0).toUpperCase() + singular.slice(1)} Name`}
            value={name}
            onChange={e => applyChange({ ...config, name: e.target.value })}
            disabled={isEditMode}
            required
            error={mergedErrors.name}
          />
        )}

        <FormShell
          type={type}
          value={config}
          onChange={applyChange}
          errors={mergedErrors}
          overrides={overrides}
          excludeFields={CHROME_FIELDS}
        />

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
        {formLevelGateErrors.length > 0 && (
          <FormAlert variant="error">
            {formLevelGateErrors.map(e => `${e.path || 'config'}: ${e.message}`).join('; ')}
          </FormAlert>
        )}
      </FormLayout>

      <FormFooter
        autoSave={isEditMode}
        rightContent={isEditMode ? <SaveStateIndicator status={autoSaveStatus} /> : undefined}
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
                  ? `Are you sure you want to delete this ${singular}? This will discard your unsaved changes.`
                  : `Are you sure you want to delete this ${singular}? This will mark it for deletion and remove it from YAML when you commit.`,
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

export default SchemaLeafForm;
