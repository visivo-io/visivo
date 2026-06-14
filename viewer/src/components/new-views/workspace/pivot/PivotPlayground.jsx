import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../../../stores/store';
import { getTypeColors } from '../../common/objectTypeConfigs';
import { useObjectCanvasDirty } from '../ObjectCanvasFrame';
import PivotFieldList from './PivotFieldList';
import PivotShelf from './PivotShelf';
import PivotResultPanel from './PivotResultPanel';
import PivotSaveModal from './PivotSaveModal';
import usePivotPlaygroundFields from './usePivotPlaygroundFields';
import {
  seedDraftFromRecord,
  serializeDraft,
  draftToPivotConfig,
  makeValueChip,
} from './pivotDraft';

/**
 * PivotPlayground — VIS-1008, the editable `build` lens of the table object
 * canvas.
 *
 * A 3-pane drag-to-shelf pivot builder:
 *   - LEFT:   PivotFieldList — the table's source fields as draggable pills.
 *   - MIDDLE: three PivotShelves (Columns / Rows / Values) — the drop targets.
 *   - RIGHT:  PivotResultPanel — the live result, re-run on every draft change.
 *
 * It owns a LOCAL structured draft seeded from the table record's existing pivot
 * config, mirrors it into the workspace store (`setWorkspacePivotDraft`) so the
 * shared dnd-kit router + a Save can reach it, re-runs the result on every
 * change, reports dirtiness to the frame, and commits the draft back through the
 * table store's `saveTable` (via `commitWorkspacePivotDraft`) on an explicit
 * Save.
 *
 * The field pills + shelves register with the shell's SINGLE shared dnd-kit
 * context (WorkspaceDndContext); dnd-kit contexts don't compose, so the
 * playground can't host its own. The shelves' droppable data carries an
 * `onDropField` callback the router invokes — the playground appends the dropped
 * field to that shelf's local draft.
 */

const PivotPlayground = ({ activeObject, projectId, record }) => {
  const name = activeObject?.name || record?.name || null;
  const colors = getTypeColors('table');

  const { setDirty } = useObjectCanvasDirty();
  const setWorkspacePivotDraft = useStore(s => s.setWorkspacePivotDraft);
  const resetWorkspacePivotDraft = useStore(s => s.resetWorkspacePivotDraft);
  const commitWorkspacePivotDraft = useStore(s => s.commitWorkspacePivotDraft);
  const commitWorkspacePivotDraftAsNew = useStore(s => s.commitWorkspacePivotDraftAsNew);

  const { fields, sourceName, isLoading: fieldsLoading } = usePivotPlaygroundFields(
    projectId,
    record
  );

  // The SAVED ref-string config (for the dirty comparison) — what's on disk.
  const savedSerialized = useMemo(() => serializeDraft(seedDraftFromRecord(record)), [record]);

  // Local structured chip draft. Seeded from the record; re-seeded when the
  // selected table changes (the frame reuses this body across sibling
  // selections, so without this the previous table's draft would leak).
  const [draft, setDraft] = useState(() => seedDraftFromRecord(record));
  const [saving, setSaving] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const seededNameRef = useRef(null);
  useEffect(() => {
    if (seededNameRef.current !== name) {
      seededNameRef.current = name;
      setDraft(seedDraftFromRecord(record));
    }
  }, [name, record]);

  // Mirror the draft into the workspace store so the dnd router + Save can reach
  // it, and clear it when this lens unmounts.
  useEffect(() => {
    if (typeof setWorkspacePivotDraft === 'function') {
      setWorkspacePivotDraft({ tableName: name, ...serializeDraft(draft) });
    }
    return () => {
      if (typeof resetWorkspacePivotDraft === 'function') resetWorkspacePivotDraft();
    };
    // Re-run when the draft or table changes; serializeDraft is pure.
  }, [draft, name, setWorkspacePivotDraft, resetWorkspacePivotDraft]);

  // Dirty === the draft's serialised refs differ from the saved config.
  const currentSerialized = useMemo(() => serializeDraft(draft), [draft]);
  const isDirty = useMemo(
    () => JSON.stringify(currentSerialized) !== JSON.stringify(savedSerialized),
    [currentSerialized, savedSerialized]
  );
  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  // ── Draft mutators (invoked by the shelf droppables' onDropField + chip UI) ──
  const handleDropField = useCallback((shelf, field) => {
    if (!field) return;
    setDraft(prev => {
      const chip =
        shelf === 'values'
          ? makeValueChip({ field: field.name, source: field.source, label: field.label })
          : { field: field.name, source: field.source, label: field.label };
      return { ...prev, [shelf]: [...(prev[shelf] || []), chip] };
    });
  }, []);

  const handleRemoveChip = useCallback((shelf, index) => {
    setDraft(prev => ({
      ...prev,
      [shelf]: (prev[shelf] || []).filter((_, i) => i !== index),
    }));
  }, []);

  const handleAggChange = useCallback((index, agg) => {
    setDraft(prev => ({
      ...prev,
      values: (prev.values || []).map((c, i) => (i === index ? { ...c, agg } : c)),
    }));
  }, []);

  // Save opens a "replace or add new" choice rather than silently committing.
  const handleSaveClick = useCallback(() => {
    if (!isDirty) return;
    setSaveModalOpen(true);
  }, [isDirty]);

  // Push the latest local draft into the store mirror so whichever commit action
  // the modal picks operates on exactly what's on screen.
  const syncDraftToStore = useCallback(() => {
    if (typeof setWorkspacePivotDraft === 'function') {
      setWorkspacePivotDraft({ tableName: name, ...serializeDraft(draft) });
    }
  }, [setWorkspacePivotDraft, name, draft]);

  const handleReplace = useCallback(async () => {
    if (typeof commitWorkspacePivotDraft !== 'function') return;
    setSaving(true);
    try {
      syncDraftToStore();
      await commitWorkspacePivotDraft();
      setSaveModalOpen(false);
    } finally {
      setSaving(false);
    }
  }, [commitWorkspacePivotDraft, syncDraftToStore]);

  const handleAddNew = useCallback(async () => {
    if (typeof commitWorkspacePivotDraftAsNew !== 'function') return;
    setSaving(true);
    try {
      syncDraftToStore();
      await commitWorkspacePivotDraftAsNew();
      setSaveModalOpen(false);
    } finally {
      setSaving(false);
    }
  }, [commitWorkspacePivotDraftAsNew, syncDraftToStore]);

  const pivotConfig = useMemo(() => draftToPivotConfig(draft), [draft]);

  if (!name) {
    return (
      <div
        data-testid="pivot-playground-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">No table selected.</span>
      </div>
    );
  }

  return (
    <div
      data-testid="pivot-playground"
      className="flex flex-1 min-h-0 min-w-0 flex-col bg-white"
    >
      {/* Toolbar */}
      <div
        className={`flex items-center justify-between gap-2 border-b ${colors.border} ${colors.bg} px-4 py-2`}
      >
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${colors.text}`}>
          Pivot Builder
        </span>
        <button
          type="button"
          data-testid="pivot-playground-save"
          disabled={!isDirty || saving}
          onClick={handleSaveClick}
          className={[
            'rounded-md px-3 py-1 text-[12px] font-semibold transition-colors',
            isDirty && !saving
              ? 'bg-primary text-white hover:bg-primary-700'
              : 'cursor-not-allowed bg-gray-100 text-gray-400',
          ].join(' ')}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <PivotSaveModal
        open={saveModalOpen}
        tableName={name}
        saving={saving}
        onReplace={handleReplace}
        onAddNew={handleAddNew}
        onCancel={() => setSaveModalOpen(false)}
      />

      <div className="flex flex-1 min-h-0 min-w-0">
        {/* LEFT — field list */}
        <PivotFieldList fields={fields} isLoading={fieldsLoading} />

        {/* MIDDLE — the three shelves */}
        <div
          data-testid="pivot-shelves"
          className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-r border-gray-200 bg-gray-50 p-3"
        >
          <PivotShelf
            shelf="columns"
            chips={draft.columns}
            onDropField={field => handleDropField('columns', field)}
            onRemoveChip={index => handleRemoveChip('columns', index)}
          />
          <PivotShelf
            shelf="rows"
            chips={draft.rows}
            onDropField={field => handleDropField('rows', field)}
            onRemoveChip={index => handleRemoveChip('rows', index)}
          />
          <PivotShelf
            shelf="values"
            chips={draft.values}
            onDropField={field => handleDropField('values', field)}
            onRemoveChip={index => handleRemoveChip('values', index)}
            onAggChange={handleAggChange}
          />
        </div>

        {/* RIGHT — live result */}
        <PivotResultPanel config={pivotConfig} sourceName={sourceName} />
      </div>
    </div>
  );
};

export default PivotPlayground;
