import React, { useEffect, useMemo, useState } from 'react';
import { PiArrowUp, PiArrowDown, PiTrash } from 'react-icons/pi';
import CircularProgress from '@mui/material/CircularProgress';
import useStore from '../../../stores/store';
import { defaultLevels } from '../../../utils/dashboardUtils';
import SelectionChip from '../workspace/SelectionChip';
import { FormInput, FormTextarea, FormAlert } from '../../styled/FormComponents';
import { Button } from '../../styled/Button';

/**
 * LevelEditForm — VIS-807 (Track M M-2b).
 *
 * The right-rail Edit-tab form for a dashboard **Level**. A level lives on
 * `defaults.levels` (an ordered array of `{ title, description? }`); the active
 * selection identifies which one by its `index` (the position the Project
 * Editor surfaced it at). This form edits the level's **title + description**
 * and persists through the store's index-based `updateLevel` action (the same
 * `saveDefaults` → defaults-cache → publish path every level CRUD uses).
 *
 * The inline reorder / delete / add affordances already exist in the Project
 * Editor (`LevelGroupHeader` / `ProjectEditor`, M-2a) and are NOT rebuilt here.
 * For convenience this form surfaces the same reorder / delete operations as
 * lightweight buttons that call the identical store actions — it does not
 * re-implement their UI.
 *
 * Fronted by a <SelectionChip> like every other Edit-tab form. There is an
 * explicit Save button (matching the leaf forms); title/description aren't
 * auto-saved because a blank intermediate title would be rejected by the
 * backend `Level` model.
 */

/**
 * Resolve the concrete editable level list. Mirrors the store's `_resolveLevels`
 * so the index the Project Editor selected maps to the same level the user saw:
 * when `defaults.levels` is empty/absent we seed from the shared `defaultLevels`
 * fallback (the first edit then persists a concrete list).
 */
const resolveLevels = defaults => {
  const configured = defaults?.levels;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(l => ({ ...l }));
  }
  return defaultLevels.map(l => ({ ...l }));
};

const LevelEditForm = ({ index, onSaved }) => {
  const defaults = useStore(s => s.defaults);
  const fetchDefaults = useStore(s => s.fetchDefaults);
  const updateLevel = useStore(s => s.updateLevel);
  const reorderLevel = useStore(s => s.reorderLevel);
  const deleteLevel = useStore(s => s.deleteLevel);

  const levels = useMemo(() => resolveLevels(defaults), [defaults]);
  const level = index >= 0 && index < levels.length ? levels[index] : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Defaults may not be loaded yet (e.g. a direct workspace visit); self-fetch
  // so the form can resolve its level.
  useEffect(() => {
    if (!defaults && fetchDefaults) fetchDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-seed the local fields whenever the resolved level changes (selection
  // switch or an external defaults refresh).
  useEffect(() => {
    if (level) {
      setTitle(level.title || '');
      setDescription(level.description || '');
      setError(null);
      setConfirmingDelete(false);
    }
  }, [level]);

  const chipName = level?.title || `Level ${index + 1}`;

  if (!level) {
    return (
      <>
        <SelectionChip type="dashboard" name={`Level ${index + 1}`} subtitle="Level" />
        <div
          data-testid="right-rail-edit-level-missing"
          className="flex flex-1 items-start justify-center px-6 py-8 text-center"
        >
          <p className="text-[13px] text-gray-500">This level no longer exists.</p>
        </div>
      </>
    );
  }

  const canMoveUp = index > 0;
  const canMoveDown = index < levels.length - 1;

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);
    const trimmed = (title || '').trim();
    if (!trimmed) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    try {
      const result = await updateLevel(index, { title: trimmed, description });
      if (result?.success || result?.error === 'unchanged') {
        if (onSaved) onSaved();
      } else {
        setError(result?.error || 'Failed to save level.');
      }
    } catch (err) {
      setError(err.message || 'Failed to save level.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SelectionChip type="dashboard" name={chipName} subtitle="Level" />
      <div data-testid="right-rail-edit-level" className="flex-1 overflow-y-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <FormAlert variant="error">{error}</FormAlert>}

          <FormInput
            id="level-title"
            label="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            helperText="How this level is labelled in the Project Editor."
            data-testid="level-edit-title"
          />

          <FormTextarea
            id="level-description"
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            helperText="What kinds of dashboards belong at this level."
            data-testid="level-edit-description"
          />

          {/* Reorder / delete reuse the existing M-2a store actions — the inline
              header affordances in the Project Editor are not rebuilt here. */}
          <div className="flex items-center gap-1.5 border-t border-gray-200 pt-3">
            <span className="mr-auto text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Order
            </span>
            <button
              type="button"
              onClick={() => reorderLevel && reorderLevel(index, -1)}
              disabled={!canMoveUp || saving}
              aria-label="Move level up"
              data-testid="level-edit-move-up"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PiArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => reorderLevel && reorderLevel(index, 1)}
              disabled={!canMoveDown || saving}
              aria-label="Move level down"
              data-testid="level-edit-move-down"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PiArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
              aria-label="Delete level"
              data-testid="level-edit-delete"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-highlight-50 hover:text-highlight disabled:cursor-not-allowed disabled:opacity-40"
            >
              <PiTrash className="h-4 w-4" />
            </button>
          </div>

          {confirmingDelete && (
            <div
              role="dialog"
              aria-label="Confirm delete level"
              data-testid="level-edit-delete-confirm"
              className="rounded-lg border border-gray-200 bg-gray-50 p-3"
            >
              <p className="text-[12.5px] leading-snug text-gray-700">
                Delete level <span className="font-semibold">“{level.title}”</span>? Its dashboards
                move to Unassigned.
              </p>
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  data-testid="level-edit-delete-cancel"
                  className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmingDelete(false);
                    if (deleteLevel) await deleteLevel(index);
                    if (onSaved) onSaved();
                  }}
                  data-testid="level-edit-delete-confirm-btn"
                  className="inline-flex h-7 items-center rounded-md bg-highlight px-2.5 text-[12px] font-semibold text-white hover:bg-highlight-700"
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <Button type="submit" disabled={saving} className="text-sm" data-testid="level-edit-save">
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
        </form>
      </div>
    </>
  );
};

export default LevelEditForm;
