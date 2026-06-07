import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../stores/store';
import EmbeddedPill from '../new-views/lineage/EmbeddedPill';

/**
 * Session-scoped key for remembering the last-used "After save" choice (J-1 /
 * VIS-774). Persists across modal opens until the viewer tab is closed.
 */
const AFTER_SAVE_SESSION_KEY = 'visivo.explorer.afterSave';

const AFTER_SAVE_STAY = 'stay';
const AFTER_SAVE_WORKSPACE = 'workspace';
const AFTER_SAVE_DASHBOARD = 'dashboard';

const readAfterSavePref = () => {
  try {
    const raw = sessionStorage.getItem(AFTER_SAVE_SESSION_KEY);
    if (raw === AFTER_SAVE_WORKSPACE || raw === AFTER_SAVE_DASHBOARD) return raw;
  } catch {
    // sessionStorage may be unavailable (private mode / SSR); fall back to default.
  }
  return AFTER_SAVE_STAY;
};

const writeAfterSavePref = value => {
  try {
    sessionStorage.setItem(AFTER_SAVE_SESSION_KEY, value);
  } catch {
    // best-effort
  }
};

/**
 * Derive the slot-picker options for a dashboard: one "at end of <row>" per
 * existing top-level row, plus a final "in a new row at the end". The value is
 * the engineering `?slot=` descriptor consumed by Build mode:
 *   - `<rowIndex>:end`  → append to that row
 *   - `new`             → a fresh row at the end
 */
const buildSlotOptions = dashboardConfig => {
  const rows = Array.isArray(dashboardConfig?.rows) ? dashboardConfig.rows : [];
  const options = rows.map((row, idx) => ({
    value: `${idx}:end`,
    label: `At end of row ${idx + 1}`,
  }));
  options.push({ value: 'new', label: 'In a new row at the end' });
  return options;
};

/**
 * ExplorerSaveModal - Shows a summary of objects to be saved and handles the save operation.
 *
 * Reads modification status from explorerDiffResult (populated by backend /api/explorer/diff/).
 *
 * J-1 (VIS-774): an "After save" section lets the user choose what happens once
 * the save succeeds — stay in Explorer (default), open the new chart in
 * Workspace, or add it to a chosen dashboard in a chosen slot. The last choice
 * is remembered per session.
 *
 * Props:
 * - onClose: (function) called when the modal should close (cancel or successful save)
 */
const ExplorerSaveModal = ({ onClose }) => {
  const navigate = useNavigate();
  const diffResult = useStore((s) => s.explorerDiffResult);
  const chartName = useStore((s) => s.explorerChartName);
  const saveExplorerObjects = useStore((s) => s.saveExplorerObjects);
  const dashboards = useStore((s) => s.dashboards);
  const fetchDashboards = useStore((s) => s.fetchDashboards);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // The standalone Explorer page doesn't load the dashboards collection, but
  // the "Add to dashboard" option (J-1) needs it. Fetch on mount so the picker
  // populates. No-op cost when the cache is already warm.
  useEffect(() => {
    if (fetchDashboards && (dashboards || []).length === 0) {
      fetchDashboards();
    }
    // Only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After-save choice + the dashboard/slot targets for the "Add to dashboard"
  // option. Initialised from the per-session preference.
  const initialChoice = useMemo(() => {
    const pref = readAfterSavePref();
    // Down-grade a remembered "dashboard" choice to "stay" if no dashboards
    // exist this session — option 3 would be disabled anyway.
    if (pref === AFTER_SAVE_DASHBOARD && (dashboards || []).length === 0) {
      return AFTER_SAVE_STAY;
    }
    return pref;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [afterSave, setAfterSave] = useState(initialChoice);
  const [targetDashboard, setTargetDashboard] = useState(
    () => (dashboards || [])[0]?.name || ''
  );
  const [targetSlot, setTargetSlot] = useState('new');

  const hasDashboards = (dashboards || []).length > 0;

  // Once dashboards load (async fetch above), seed the picker if it's empty.
  useEffect(() => {
    if (!targetDashboard && (dashboards || []).length > 0) {
      setTargetDashboard(dashboards[0].name);
    }
  }, [dashboards, targetDashboard]);

  const slotOptions = useMemo(() => {
    const dash = (dashboards || []).find((d) => d.name === targetDashboard);
    return buildSlotOptions(dash?.config || dash);
  }, [dashboards, targetDashboard]);

  const handleAfterSaveChange = useCallback((value) => {
    setAfterSave(value);
    writeAfterSavePref(value);
  }, []);

  const { newItems, modifiedItems, chartStatus } = useMemo(() => {
    const newArr = [];
    const modArr = [];

    if (diffResult) {
      for (const [category, statuses] of Object.entries(diffResult)) {
        if (category === 'chart') continue;
        // Map category to objectType (e.g., "models" → "model")
        const objectType = category.replace(/s$/, '');
        for (const [name, status] of Object.entries(statuses || {})) {
          if (status === 'new') newArr.push({ name, objectType });
          else if (status === 'modified') modArr.push({ name, objectType });
        }
      }
    }

    return {
      newItems: newArr,
      modifiedItems: modArr,
      chartStatus: diffResult?.chart || null,
    };
  }, [diffResult]);

  const totalChanges = newItems.length + modifiedItems.length + (chartStatus ? 1 : 0);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveExplorerObjects();
      if (result.success) {
        // After-save navigation (J-1). The new chart is the wrapping object the
        // user places on a dashboard.
        if (afterSave === AFTER_SAVE_WORKSPACE) {
          navigate('/workspace');
        } else if (afterSave === AFTER_SAVE_DASHBOARD && targetDashboard) {
          const params = new URLSearchParams();
          params.set('slot', targetSlot);
          if (chartName) params.set('newItem', chartName);
          navigate(
            `/workspace/dashboard/${encodeURIComponent(targetDashboard)}?${params.toString()}`
          );
        }
        onClose();
      } else {
        const messages = result.errors.map((e) => `${e.type} "${e.name}": ${e.error}`);
        setError(messages.join('; '));
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }, [saveExplorerObjects, onClose, afterSave, targetDashboard, targetSlot, chartName, navigate]);

  const radioBase =
    'flex items-start gap-2 text-sm text-secondary-700 cursor-pointer select-none';
  const selectBase =
    'rounded-md border border-secondary-300 text-sm px-2 py-1 text-secondary-700 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div
      data-testid="explorer-save-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-medium text-secondary-900 mb-4">Save to Project</h3>

        {totalChanges === 0 && (
          <p className="text-sm text-secondary-500 mb-4">No changes to save.</p>
        )}

        {/* New objects */}
        {(newItems.length > 0 || chartStatus === 'new') && (
          <div className="mb-3">
            <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-1.5">
              New
            </p>
            <div className="flex flex-wrap gap-1.5">
              {newItems.map(({ name, objectType }) => (
                <EmbeddedPill
                  key={`${objectType}-${name}`}
                  objectType={objectType}
                  label={name}
                  statusDot="new"
                  as="div"
                />
              ))}
              {chartStatus === 'new' && (
                <EmbeddedPill objectType="chart" label={chartName} statusDot="new" as="div" />
              )}
            </div>
          </div>
        )}

        {/* Modified objects */}
        {(modifiedItems.length > 0 || chartStatus === 'modified') && (
          <div className="mb-3">
            <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-1.5">
              Modified
            </p>
            <div className="flex flex-wrap gap-1.5">
              {modifiedItems.map(({ name, objectType }) => (
                <EmbeddedPill
                  key={`${objectType}-${name}`}
                  objectType={objectType}
                  label={name}
                  statusDot="modified"
                  as="div"
                />
              ))}
              {chartStatus === 'modified' && (
                <EmbeddedPill objectType="chart" label={chartName} statusDot="modified" as="div" />
              )}
            </div>
          </div>
        )}

        {/* After save (J-1 / VIS-774) */}
        <div
          data-testid="after-save-section"
          className="mt-4 pt-4 border-t border-secondary-100"
        >
          <p className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-2">
            After save
          </p>
          <div className="space-y-2">
            <label className={radioBase}>
              <input
                type="radio"
                name="after-save"
                data-testid="after-save-stay"
                aria-label="Stay in Explorer"
                className="mt-0.5 accent-primary"
                checked={afterSave === AFTER_SAVE_STAY}
                onChange={() => handleAfterSaveChange(AFTER_SAVE_STAY)}
                disabled={saving}
              />
              <span>Stay in Explorer</span>
            </label>

            <label className={radioBase}>
              <input
                type="radio"
                name="after-save"
                data-testid="after-save-workspace"
                aria-label="Open in Workspace"
                className="mt-0.5 accent-primary"
                checked={afterSave === AFTER_SAVE_WORKSPACE}
                onChange={() => handleAfterSaveChange(AFTER_SAVE_WORKSPACE)}
                disabled={saving}
              />
              <span>Open in Workspace</span>
            </label>

            <label
              className={`${radioBase} ${!hasDashboards ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                !hasDashboards
                  ? 'No dashboards exist yet — create one in Workspace first.'
                  : undefined
              }
            >
              <input
                type="radio"
                name="after-save"
                data-testid="after-save-dashboard"
                aria-label="Add to dashboard"
                className="mt-0.5 accent-primary"
                checked={afterSave === AFTER_SAVE_DASHBOARD}
                onChange={() => handleAfterSaveChange(AFTER_SAVE_DASHBOARD)}
                disabled={saving || !hasDashboards}
              />
              <span className="flex flex-wrap items-center gap-1.5">
                <span>Add to dashboard</span>
                <select
                  data-testid="after-save-dashboard-select"
                  className={selectBase}
                  value={targetDashboard}
                  disabled={saving || !hasDashboards || afterSave !== AFTER_SAVE_DASHBOARD}
                  onChange={(e) => {
                    setTargetDashboard(e.target.value);
                    setTargetSlot('new');
                  }}
                >
                  {(dashboards || []).map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span>in slot</span>
                <select
                  data-testid="after-save-slot-select"
                  className={selectBase}
                  value={targetSlot}
                  disabled={saving || !hasDashboards || afterSave !== AFTER_SAVE_DASHBOARD}
                  onChange={(e) => setTargetSlot(e.target.value)}
                >
                  {slotOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div
            data-testid="save-error"
            className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            data-testid="save-modal-cancel"
            type="button"
            disabled={saving}
            onClick={onClose}
            className="py-2 px-4 text-sm font-medium rounded-lg border border-secondary-300 text-secondary-700 hover:bg-secondary-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            data-testid="save-modal-confirm"
            type="button"
            disabled={saving || totalChanges === 0}
            onClick={handleSave}
            className="py-2 px-4 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExplorerSaveModal;
