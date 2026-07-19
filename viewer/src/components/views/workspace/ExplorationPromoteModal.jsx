import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PiCheckCircle, PiXCircle, PiCircleNotch } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { buildPromoteChecklist } from '../../../stores/promoteChecklist';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';
import FieldSwapOfferBanner from './FieldSwapOfferBanner';

const TIER_HEADING = { model: 'MODELS', field: 'FIELDS', insight: 'INSIGHTS', chart: 'CHART' };
const TIER_ORDER = ['model', 'field', 'insight', 'chart'];

const rowKey = row => `${row.type}:${row.name}`;

/**
 * ExplorationPromoteModal — Explore 2.0 Phase 4 (01-ux-spec.md §3's "Save to
 * Project" checklist mockup, 02-architecture.md §3). REPLACES
 * `ExplorerSaveModal`/`saveExplorerObjects` (both deleted with this change) —
 * unlike that all-or-nothing modal, this is a per-object gated promote:
 *
 *   MODELS        ☑ orders_q          ✓ valid
 *   FIELDS        ☑ churn_rate        ✓ valid   (→ orders_q)
 *                 ☐ bad_ratio         ✕ expression fails: <err>
 *   INSIGHTS      ☑ churn_by_cohort   ✓ valid
 *   CHART         ☑ churn_chart       ✓ valid
 *                            [Cancel]  [Promote 4 selected ▸]
 *
 * Default selection: every VALID row pre-checked; failed rows are visible
 * but flagged and un-checkable (a failed object blocks only itself — no
 * cascade-disabling of children). "updates existing ✎" marks a `modified`
 * row — promoting a draft seeded from an existing object of the SAME NAME
 * updates the original (05-e2e-ledger.md resolution #1), never creates a
 * duplicate.
 */
const ExplorationPromoteModal = ({ explorationId, onClose }) => {
  const promoteExploration = useStore(s => s.promoteExploration);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState(null);
  const [reclassificationOffers, setReclassificationOffers] = useState([]);
  const [promotedThisRun, setPromotedThisRun] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const built = await buildPromoteChecklist(useStore.getState);
      if (cancelled) return;
      setRows(built);
      setSelected(new Set(built.filter(r => r.valid).map(rowKey)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((row) => {
    if (!row.valid) return;
    setSelected(prev => {
      const next = new Set(prev);
      const key = rowKey(row);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const grouped = useMemo(() => {
    const g = {};
    TIER_ORDER.forEach(t => (g[t] = []));
    rows.forEach(r => g[r.tier]?.push(r));
    return g;
  }, [rows]);

  const selectedCount = selected.size;

  const handlePromote = useCallback(async () => {
    setPromoting(true);
    setError(null);
    const selection = Array.from(selected).map(key => {
      const idx = key.indexOf(':');
      return { type: key.slice(0, idx), name: key.slice(idx + 1) };
    });
    const result = await promoteExploration(explorationId, selection);
    setPromoting(false);
    setPromotedThisRun(result);

    const failed = (result.results || []).filter(r => !r.success);
    if (failed.length > 0) {
      setError(
        `${failed.length} object${failed.length === 1 ? '' : 's'} failed to promote: ${failed
          .map(f => `${f.name} (${f.error})`)
          .join('; ')}`
      );
    }
    if (result.reclassificationOffers?.length > 0) {
      setReclassificationOffers(result.reclassificationOffers);
    }
    // Deliberately NEVER auto-close here, even on the common all-valid,
    // no-collision path: `setPromotedThisRun` and a same-tick `onClose()`
    // land in the SAME React commit, so the "Promoted N objects" success
    // message (and its `exploration-promote-success` testid) would never
    // actually paint — the modal would just vanish, giving the user no
    // confirmation of what was promoted. Root-caused via live reproduction
    // against the sandbox (integration-gate fix cycle). The "Close" button's
    // own label already switches to "Close" once `promotedThisRun` is set
    // (see the JSX below) — that affordance is how the user dismisses after
    // reviewing the result, for both the success and failure/offer cases.
  }, [selected, promoteExploration, explorationId]);

  const dismissOffer = useCallback(index => {
    setReclassificationOffers(prev => prev.filter((_, i) => i !== index));
  }, []);

  const totalRows = rows.length;

  return (
    <div
      data-testid="exploration-promote-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={e => {
        if (e.target === e.currentTarget && !promoting) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save to Project"
        className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto"
      >
        <h3 className="text-lg font-medium text-secondary-900 mb-1">Save to Project</h3>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-secondary-400 text-sm">
            <PiCircleNotch className="animate-spin" size={16} />
            Checking your draft…
          </div>
        ) : totalRows === 0 ? (
          <p className="text-sm text-secondary-500 py-4">No changes to save.</p>
        ) : (
          <div className="space-y-3 mt-3">
            {TIER_ORDER.filter(tier => grouped[tier].length > 0).map(tier => (
              <div key={tier}>
                <p className="text-xs font-medium text-secondary-400 uppercase tracking-wide mb-1">
                  {TIER_HEADING[tier]}
                </p>
                <div className="space-y-1">
                  {grouped[tier].map(row => {
                    const colors = getTypeColors(row.type);
                    const Icon = getTypeIcon(row.type);
                    const key = rowKey(row);
                    const checked = selected.has(key);
                    return (
                      <label
                        key={key}
                        data-testid={`promote-row-${row.type}-${row.name}`}
                        className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                          row.valid ? 'cursor-pointer hover:bg-gray-50' : 'opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          data-testid={`promote-row-${row.type}-${row.name}-checkbox`}
                          checked={checked}
                          disabled={!row.valid}
                          onChange={() => toggle(row)}
                          className="mt-0.5"
                        />
                        {Icon && (
                          <span
                            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${colors.bg} ${colors.text}`}
                          >
                            <Icon style={{ fontSize: 11 }} />
                          </span>
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-secondary-900">{row.name}</span>
                          {row.parentModel && (
                            <span className="text-secondary-400"> (→ {row.parentModel})</span>
                          )}
                        </span>
                        {row.valid ? (
                          <span
                            className="flex items-center gap-1 text-green-600 text-xs shrink-0"
                            data-testid={`promote-row-${row.type}-${row.name}-verdict`}
                          >
                            <PiCheckCircle size={13} />
                            {row.status === 'modified' ? 'updates existing ✎' : 'valid'}
                          </span>
                        ) : (
                          <span
                            className="flex items-start gap-1 text-highlight-600 text-xs shrink-0 max-w-[45%] text-right"
                            data-testid={`promote-row-${row.type}-${row.name}-verdict`}
                            title={row.error}
                          >
                            <PiXCircle size={13} className="mt-0.5 shrink-0" />
                            <span className="truncate">{row.error || 'invalid'}</span>
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {reclassificationOffers.length > 0 && (
          <div className="mt-3">
            <FieldSwapOfferBanner offers={reclassificationOffers} onDismiss={dismissOffer} />
          </div>
        )}

        {error && (
          <p
            data-testid="exploration-promote-error"
            className="mt-3 text-xs text-highlight-600 bg-highlight-50 border border-highlight-200 rounded-md px-2.5 py-1.5"
          >
            {error}
          </p>
        )}

        {promotedThisRun?.success && reclassificationOffers.length === 0 && (
          <p
            data-testid="exploration-promote-success"
            className="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5"
          >
            Promoted {promotedThisRun.results.filter(r => r.success).length} object
            {promotedThisRun.results.filter(r => r.success).length === 1 ? '' : 's'}.
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-secondary-100 flex justify-end gap-2">
          <button
            type="button"
            data-testid="exploration-promote-cancel"
            onClick={() => onClose?.()}
            disabled={promoting}
            className="px-4 py-2 text-sm font-medium text-secondary-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            {promotedThisRun ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            data-testid="exploration-promote-submit"
            onClick={handlePromote}
            disabled={promoting || selectedCount === 0 || loading}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {promoting ? 'Promoting…' : `Promote ${selectedCount} selected ▸`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExplorationPromoteModal;
