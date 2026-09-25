import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import useRecordSave from '../../../hooks/useRecordSave';
import useFormBaseline from '../../../hooks/useFormBaseline';
import { FormInput, FormFooter, FormLayout, FormAlert } from '../../styled/FormComponents';
import ExpressionField from '../common/ExpressionField';
import { REF_INSERT_HINT } from '../common/RefTextArea';
import { validateName } from '../common/namedModel';
import { isEmbeddedObject } from '../common/embeddedObjectUtils';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { BackNavigationButton } from '../../styled/BackNavigationButton';
import { FormShell } from './FormShell';
import { SAVE_ACTION, DELETE_ACTION } from './collectionKeys';
import RenameImpactDialog from './RenameImpactDialog';
import useRenameFlow from '../../../hooks/useRenameFlow';
import { unwrapConfig } from './unwrapRecordConfig';
import { getObjectSchemaSync } from '../../../schemas/projectSchema';
import { useFieldParentModel } from './fields/useFieldParentModel';
import { checkRefCounts } from './refCountPreflight';

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
 *   - edit mode: explicit Delete · Discard · Save (matching every other leaf
 *     panel). Save flushes through the gated useRecordSave backbone (VIS-993),
 *     Discard reverts to the last-saved values, Save is gated on real edits
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
 * Per-type declarative layer — PROSE AND LAYOUT ONLY. `expressionField` names
 * the schema field that renders through `ExpressionField` instead of the
 * generic engine widget; `helperText`/`embeddedHelperText`/`rows` carry
 * guidance and sizing the schema description doesn't.
 *
 * The authoring RULES — which editor, which refs are legal, whether a bare ref
 * or an index is allowed — deliberately do NOT live here any more. They're in
 * `common/fieldTypes.js`, so the Explorer's computed-column popover and this
 * form can't disagree about the same field. `allowedTypes` used to sit here and
 * was one of seven such literals.
 */
export const TYPE_CONFIG = {
  dimension: {
    expressionField: 'expression',
    expressionLabel: 'Expression',
    helperText: `SQL expression for this dimension. ${REF_INSERT_HINT}`,
    embeddedHelperText: 'Plain SQL expression referencing columns from the parent model.',
    rows: 4,
  },
  metric: {
    expressionField: 'expression',
    expressionLabel: 'Expression',
    helperText: `SQL aggregate expression for this metric. ${REF_INSERT_HINT}`,
    embeddedHelperText: 'Plain SQL aggregate expression over the parent model.',
    rows: 4,
  },
  relation: {
    expressionField: 'condition',
    expressionLabel: 'Condition',
    // eslint-disable-next-line no-template-curly-in-string
    helperText: `Join condition between two models — every reference needs a column. ${REF_INSERT_HINT}`,
    rows: 4,
  },
};

/** Fields the host renders as chrome — withheld from the generated groups. */
const CHROME_FIELDS = ['name'];

/** Title-case a schema field name for messages ('join_type' → 'Join type'). */
const fieldLabel = (schema, name) =>
  schema?.properties?.[name]?.title ||
  name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');

const SchemaLeafForm = ({ type, record, isCreate = false, onClose, onSave, onGoBack, onDirtyChange }) => {
  const store = useStore();
  const checkCommitStatus = store.checkCommitStatus;

  const isEmbedded = isEmbeddedObject(record);
  // MODEL-SCOPED is not the same thing as EMBEDDED, and conflating them was a
  // bug. `isEmbedded` means "edited in place inside its parent's config" — it
  // reads `record._embedded`. A metric/dimension defined UNDER a model is
  // loaded from its OWN collection with `_embedded` unset, carrying the parent
  // as a SIBLING of `config` rather than a field inside it: `Metric`/`Dimension`
  // declare no `model` field and forbid extras, so nesting can only be
  // expressed positionally in the YAML.
  //
  // Exactly two keys mean "scoped to a model", and both are load-bearing:
  //   - `parentModel`, attached by the managers ONLY when walking
  //     `model.dimensions` / `model.metrics` (i.e. genuinely nested), and
  //   - `config.parentModel`, which `saveAsMetricFlow` and `promoteChecklist`
  //     write to REQUEST nesting; `project_writer._new` then nests it.
  //
  // Deliberately NOT `config.model`: `Dimension`/`Metric` can never return one,
  // so testing for it could only ever produce a false positive — a standalone
  // field wrongly demoted to plain SQL, losing its ref editor.
  //
  // This one value drives two things, and each was a separate bug:
  //   1. the GRAMMAR — `sql_model.py` rejects any ref() in a nested expression,
  //      so a model-scoped field must get the plain editor, not the ref one;
  //   2. the SAVE BODY — built as `{ ...config, name }`, it dropped every
  //      sibling key, so the object validated as standalone and
  //      `project_writer` wrote it to the top level, silently un-nesting a
  //      field from its model on an ordinary save.
  const parentModelName = record?.parentModel || record?.config?.parentModel || null;
  const isModelScoped = isEmbedded || !!parentModelName;
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

  // VIS-993: Save flushes through the gated optimistic backbone (schema + refs +
  // expressions). Bound to this record only in edit mode; create/embedded persist
  // through their own paths below.
  const { saveNow, errors: gateErrors } = useRecordSave(
    type,
    isEditMode ? recordName || null : null,
    { sourceDialect }
  );

  // VIS-1133: snapshot the last-saved config so Discard reverts to it and the
  // footer's Save/Discard gate on real edits.
  const applyValues = useCallback(cfg => setConfig(cfg), []);
  // Per-object drafts: unsaved edits survive navigating away and reloads.
  // Embedded (inline-on-a-model) records have no standalone identity.
  const draftKey = isEditMode && recordName ? `${type}:${recordName}` : undefined;
  const { seed, discard, isDirtyAgainst } = useFormBaseline(applyValues, draftKey);

  useEffect(() => {
    if (record) {
      const cfg = unwrapConfig(record) || {};
      // Embedded records keep their identity in config.name; standalone records
      // may only carry it at the record level.
      seed({ ...cfg, name: cfg.name || record.name || '' });
    } else {
      seed({});
    }
    setLocalErrors({});
    setSaveError(null);
    // Re-seed when the record IDENTITY (or mode) changes — including the fresh
    // object our own Save writes back optimistically, which is how the baseline
    // advances after a save. `seed` is stable per `applyValues`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, isCreate, type]);

  const name = config.name || '';
  const rename = useRenameFlow({ type, recordName, name });

  // Edits update the working config; nothing persists until an explicit Save.
  const applyChange = useCallback(nextConfig => setConfig(nextConfig), []);

  const dirty = isDirtyAgainst(config);

  // Report upward so the tab strip's unsaved dot + guarded close reflect edits.
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // ---- validation (create/embedded save path; edit mode is gate-driven) ----
  // FormShell warms the per-type schema cache on mount, so a sync read at
  // save-click time is race-free (and null-safe before the first load).
  const validateForm = () => {
    const schemaForValidation = getObjectSchemaSync(type);
    const errs = {};
    if (!isEmbedded) {
      const nameError = validateName(name, type);
      if (nameError) errs.name = nameError;
    }
    const required = schemaForValidation?.required || [];
    required.forEach(f => {
      const v = config[f];
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
        errs[f] = `${fieldLabel(schemaForValidation, f)} is required`;
      }
    });
    // Ref-count bounds from the field-type registry — BOTH directions from one
    // rule: nested expressions may contain no ref (`sql_model.py` rejects them),
    // project-level metric/dimension expressions must contain at least one (it
    // is the only thing tying them to a source). Reported per-field so it
    // renders under the input, like every other validation message.
    checkRefCounts(type, config, { nested: isModelScoped || isEmbedded }).errors.forEach(e => {
      if (!errs[e.path]) errs[e.path] = e.message;
    });
    setLocalErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ---- save / delete ----
  const handleSave = async () => {
    if (!validateForm()) return;
    // A changed name in edit mode is a rename, not a field edit.
    if (isEditMode && rename.nameChanged) {
      rename.start();
      return;
    }
    setSaving(true);
    setSaveError(null);
    // Carry the scope through the round trip; see `parentModelName` above.
    const body = { ...config, name, ...(parentModelName ? { parentModel: parentModelName } : {}) };
    try {
      if (isEmbedded) {
        // Embedded object — delegate; the parent applies it via its edit stack.
        const result = await onSave(type, name, body);
        setSaving(false);
        if (!result?.success) setSaveError(result?.error || `Failed to save ${type}`);
      } else if (isEditMode) {
        // Standalone edit — flush through the gated optimistic backbone. The
        // saveX refetch writes the record back, re-seeding the baseline so the
        // form goes clean. A gate block surfaces inline via `gateErrors`, so
        // only a hard failure gets the generic form-level message.
        const { name: _n, ...rest } = body;
        const result = await saveNow({ name: recordName, ...rest });
        setSaving(false);
        if (result && result.success === false && !result.validation) {
          setSaveError(result.error || `Failed to save ${type}`);
        }
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

  // ---- expression widget override ----
  // Which editor this field gets, and which refs it may contain, come from the
  // field-type registry rather than from `typeConfig` literals. `isEmbedded` is
  // the nested case: a metric/dimension defined UNDER a model, where
  // `sql_model.py` rejects any ref — so the registry resolves it to `plain-sql`
  // and `ExpressionField` renders a bare textarea with no ref affordances.
  const overrides = useMemo(() => {
    const exprField = typeConfig.expressionField;
    if (!exprField) return {};
    return {
      [exprField]: ({ value, onChange, error }) => (
        <ExpressionField
          objectType={type}
          field={exprField}
          nested={isModelScoped}
          scopedToModel={parentModelName}
          value={value}
          onChange={onChange}
          error={error}
          required
          label={typeConfig.expressionLabel || fieldLabel(getObjectSchemaSync(type), exprField)}
          rows={typeConfig.rows || 4}
          helperText={
            isModelScoped && typeConfig.embeddedHelperText
              ? typeConfig.embeddedHelperText
              : typeConfig.helperText
          }
        />
      ),
    };
    // typeConfig is a stable module-level object per type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, isModelScoped]);

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
            // Editable in edit mode only where the server can carry the
            // rename through: changing it here without the `${ref()}` rewrite
            // would orphan every reference to this object.
            disabled={isEditMode && !rename.supported}
            required
            error={mergedErrors.name}
            helperText={
              isEditMode && rename.supported && rename.nameChanged
                ? 'Saving will rename this object and update everything that references it.'
                : undefined
            }
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

      {rename.dialogProps && <RenameImpactDialog {...rename.dialogProps} />}

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
