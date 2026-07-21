import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PiCheckCircle, PiXCircle, PiCircleNotch } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { buildPromoteChecklist } from '../../../stores/promoteChecklist';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';
import FieldSwapOfferBanner from './FieldSwapOfferBanner';
import Select from '../../common/Select';

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
const EMPTY_DASHBOARDS = [];

const ExplorationPromoteModal = ({ explorationId, onClose }) => {
  const promoteExploration = useStore(s => s.promoteExploration);
  // VIS-1068 — dashboard round-trip completion: read the exploration's own
  // one-shot `return_to` intent + the live dashboard list (for the disabled-
  // with-tooltip case when the target dashboard no longer exists).
  const returnTo = useStore(s =>
    explorationId ? s.workspaceExplorations?.byId?.[explorationId]?.returnTo || null : null
  );
  const dashboards = useStore(s => s.dashboards || EMPTY_DASHBOARDS);
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const placeChartInDashboardSlot = useStore(s => s.placeChartInDashboardSlot);
  const consumeExplorationReturnTo = useStore(s => s.consumeExplorationReturnTo);
  // VIS-1069 — Semantic Layer reciprocal: "View in Semantic Layer" after
  // promoting a metric/dimension.
  const setWorkspaceSemanticLayerFocusIntent = useStore(s => s.setWorkspaceSemanticLayerFocusIntent);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState(null);
  const [reclassificationOffers, setReclassificationOffers] = useState([]);
  const [promotedThisRun, setPromotedThisRun] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [declineError, setDeclineError] = useState(null);

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

  // P5-D2 (e2e-gap-review.md "Final delta pass") — partial promotion is
  // documented as "normal" (handlePromote's own error-branch above handles
  // it), so `promotedThisRun.success` (== every row succeeded) must NOT gate
  // whether the succeeded rows' offers render. `promotedChart`/`promotedField`
  // below already scope to per-row success; the success banner + both offer
  // banners key off `promotedThisRun` existing and the relevant row(s) having
  // actually succeeded, never overall-batch success.
  const succeededCount = useMemo(
    () => (promotedThisRun?.results || []).filter(r => r.success).length,
    [promotedThisRun]
  );

  // VIS-1068 — the chart promoted THIS RUN (return_to placement only makes
  // sense for a run that actually promoted a chart; older promotes in a
  // prior session don't retroactively offer placement).
  const promotedChart = useMemo(
    () => (promotedThisRun?.results || []).find(r => r.success && r.type === 'chart') || null,
    [promotedThisRun]
  );
  const dashboardExists = useMemo(
    () => !!returnTo?.dashboard && dashboards.some(d => d.name === returnTo.dashboard),
    [returnTo, dashboards]
  );

  // ux-audit.md "post-promote offers never appear" finding (⚠
  // conflicts-with-e2e — promote-roundtrip #9): the `return_to`-driven offer
  // above is real and works — dashboard-newchart-roundtrip.spec.mjs proves
  // it — but `return_to` is only ever armed by ONE specific entry point
  // (Library "+ New" -> Chart, scoped to an already-open dashboard tab). The
  // canonical build flow this audit walked through (Explorer home -> source
  // tile -> query -> chart -> Save to Project) never sets it, so the
  // flywheel's own advertised "promote -> place in dashboard" round-trip had
  // NO exit ramp at all for the single most common path — a too-narrow
  // condition on an otherwise-correct feature, not a bug in the feature
  // itself. This fallback reuses the exact same `placeChartInDashboardSlot`
  // plumbing for the common case: a chart was promoted this run, there's no
  // `return_to` intent already offering placement, and at least one
  // dashboard exists to place it in.
  const showFallbackDashboardOffer = !!promotedChart && !returnTo?.dashboard && dashboards.length > 0;
  const [fallbackDashboardName, setFallbackDashboardName] = useState('');
  useEffect(() => {
    if (showFallbackDashboardOffer && !fallbackDashboardName) {
      setFallbackDashboardName(dashboards[0]?.name || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFallbackDashboardOffer, dashboards]);
  const [fallbackPlacing, setFallbackPlacing] = useState(false);
  const [fallbackPlaceError, setFallbackPlaceError] = useState(null);
  const fallbackPlacingRef = useRef(false);

  const handleFallbackPlace = useCallback(async () => {
    if (fallbackPlacingRef.current) return;
    if (!promotedChart || !fallbackDashboardName || !placeChartInDashboardSlot) return;
    fallbackPlacingRef.current = true;
    setFallbackPlacing(true);
    setFallbackPlaceError(null);
    try {
      const placeResult = await placeChartInDashboardSlot(fallbackDashboardName, promotedChart.name);
      if (!placeResult?.success) {
        setFallbackPlaceError(placeResult?.error || 'Could not place the chart in the dashboard');
        return;
      }
      openWorkspaceTab?.({
        id: `dashboard:${fallbackDashboardName}`,
        type: 'dashboard',
        name: fallbackDashboardName,
      });
      onClose?.();
    } finally {
      fallbackPlacingRef.current = false;
      setFallbackPlacing(false);
    }
  }, [promotedChart, fallbackDashboardName, placeChartInDashboardSlot, openWorkspaceTab, onClose]);

  // P5-D4 (e2e-gap-review.md "Final delta pass") — `disabled={placing}` alone
  // is not a sufficient double-click guard: a real double-click can dispatch
  // both click events before React re-renders the button disabled (the exact
  // bug class VIS-1084/VIS-1086 fixed for ExplorationPane's handleDuplicate,
  // via `duplicatingRef` above). Mirrors that same synchronous-ref pattern.
  const placingRef = useRef(false);

  const handlePlaceInDashboard = useCallback(async () => {
    if (placingRef.current) return;
    if (!returnTo?.dashboard || !promotedChart || !placeChartInDashboardSlot) return;
    placingRef.current = true;
    setPlacing(true);
    setPlaceError(null);
    try {
      const placeResult = await placeChartInDashboardSlot(
        returnTo.dashboard,
        promotedChart.name,
        returnTo.slot
      );
      if (!placeResult?.success) {
        setPlaceError(placeResult?.error || 'Could not place the chart in the dashboard');
        return;
      }
      // P6-D10 (e2e-gap-review.md "Phase 6 delta pass") — the store method
      // catches its own errors and returns `{success: false}` rather than
      // throwing (see its docstring's unlocked read-modify-write note), so
      // this MUST be checked, not just awaited. The chart above was already
      // placed successfully; if only clearing the placement intent fails,
      // `return_to` stays persisted on the record and this SAME offer would
      // re-render on a later promote run — a second "Place" click would then
      // call `placeChartInDashboardSlot` again for a chart already sitting
      // in the dashboard, adding a duplicate slot. Surface the failure (the
      // same treatment the placement failure above gets) and deliberately
      // do NOT close/navigate — closing here would hide that the intent is
      // still live.
      const consumeResult = await consumeExplorationReturnTo?.(explorationId);
      if (consumeResult && consumeResult.success === false) {
        setPlaceError(
          consumeResult.error ||
            'Chart placed, but could not clear the placement prompt — try again.'
        );
        return;
      }
      openWorkspaceTab?.({
        id: `dashboard:${returnTo.dashboard}`,
        type: 'dashboard',
        name: returnTo.dashboard,
      });
      onClose?.();
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  }, [
    returnTo,
    promotedChart,
    placeChartInDashboardSlot,
    consumeExplorationReturnTo,
    explorationId,
    openWorkspaceTab,
    onClose,
  ]);

  // P6-D11 (e2e-gap-review.md "Phase 6 delta pass") — the same synchronous
  // in-flight ref guard `placingRef` above exists for exactly this reason
  // (`disabled={...}` alone cannot stop a real double-click — the second
  // click's event dispatches before React re-renders the button disabled).
  // `handleDeclinePlacement` below was made async in the same P5-D5 pass
  // that added `placingRef` to the adjacent button, but never got its own
  // guard — a double-click on "Not now" could enqueue `consumeReturnTo`
  // twice.
  const decliningRef = useRef(false);

  // "Declining also consumes" (01-ux-spec.md §5) — an explicit choice, never
  // silent accretion of an ever-growing pile of dead placement intents.
  //
  // P5-D5 (e2e-gap-review.md "Final delta pass") — this used to be a bare,
  // un-awaited fire-and-forget call: no loading/disabled state of its own, no
  // error surfaced on failure, so a failed consume-return-to (network blip,
  // or a concurrent write conflict on the same on-disk record — the exact
  // unlocked read-modify-write risk `consumeExplorationReturnTo`'s own
  // docstring calls out) silently left the offer able to resurface later
  // with none of the accept path's rigor. Mirrors `handlePlaceInDashboard`'s
  // own async/error-surfacing shape.
  const handleDeclinePlacement = useCallback(async () => {
    if (decliningRef.current) return;
    decliningRef.current = true;
    setDeclining(true);
    setDeclineError(null);
    try {
      const result = await consumeExplorationReturnTo?.(explorationId);
      if (!result?.success) {
        setDeclineError(result?.error || 'Could not dismiss the placement offer');
      }
    } finally {
      decliningRef.current = false;
      setDeclining(false);
    }
  }, [consumeExplorationReturnTo, explorationId]);

  // VIS-1069 — the first metric/dimension/model promoted THIS RUN (mirrors
  // `promotedChart`'s "this run only" scoping above).
  //
  // ux-audit.md "post-promote offers never appear" finding (⚠
  // conflicts-with-e2e — promote-roundtrip #9): this originally only
  // considered `type === 'metric' || type === 'dimension'`, which is real
  // and correct for ITS OWN narrow trigger (Save-as-metric on a pill) but is
  // NEVER true for the single most common promote outcome — a plain
  // query -> chart flow promotes a MODEL + an INSIGHT + a CHART, never a
  // metric/dimension. A model is exactly as semantic-layer-visible as a
  // metric/dimension (it's a node on the same ERD), so the same reciprocal
  // "go look at what you just published" offer applies to it too — this was
  // a too-narrow condition, not a discoverability gap in an otherwise-correct
  // trigger.
  // Composed-gate correction: `find()` over the results scans them in PROMOTE
  // order, which is dependency-ordered — the model a metric depends on is
  // always promoted (and therefore found) first. Broadening to models above
  // then meant a run that published a metric offered "View <its model> in the
  // Semantic Layer", naming the incidental dependency instead of the thing
  // the user just built. Prefer the most specific field, fall back to the
  // model so the plain query -> chart flow still gets an offer.
  const promotedField = useMemo(() => {
    const succeeded = (promotedThisRun?.results || []).filter(r => r.success);
    return (
      succeeded.find(r => r.type === 'metric' || r.type === 'dimension') ||
      succeeded.find(r => r.type === 'model') ||
      null
    );
  }, [promotedThisRun]);

  const handleViewInSemanticLayer = useCallback(() => {
    if (!promotedField) return;
    setWorkspaceSemanticLayerFocusIntent?.({
      objectKey: `${promotedField.type}:${promotedField.name}`,
    });
    openWorkspaceTab?.({
      id: 'semantic-layer:semantic-layer',
      type: 'semantic-layer',
      name: 'semantic-layer',
    });
    onClose?.();
  }, [promotedField, setWorkspaceSemanticLayerFocusIntent, openWorkspaceTab, onClose]);

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

        {promotedThisRun && succeededCount > 0 && reclassificationOffers.length === 0 && (
          <p
            data-testid="exploration-promote-success"
            className="mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1.5"
          >
            Promoted {succeededCount} object
            {succeededCount === 1 ? '' : 's'}.
          </p>
        )}

        {/* VIS-1068 — dashboard round-trip completion. Only offered on a run
            that actually promoted a chart while return_to is still set (a
            reload between opening the intent-carrying exploration and
            promoting preserves return_to — it's fetched from the backend on
            every load, never derived from a mount-time snapshot here). A
            return_to whose dashboard no longer exists renders the offer
            DISABLED with a tooltip rather than hiding it (04-bug-inventory.md
            D12's validation nit). */}
        {promotedThisRun && returnTo?.dashboard && promotedChart && (
          <div
            data-testid="exploration-promote-return-to-offer"
            className="mt-3 flex items-center justify-between gap-2 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-2"
          >
            <span className="text-xs text-primary-800">
              Place <span className="font-medium">{promotedChart.name}</span> in{' '}
              <span className="font-medium">{returnTo.dashboard}</span>?
            </span>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                data-testid="exploration-promote-decline-placement"
                onClick={handleDeclinePlacement}
                disabled={placing || declining}
                className="rounded-md px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
              >
                {declining ? 'Dismissing…' : 'Not now'}
              </button>
              <button
                type="button"
                data-testid="exploration-promote-place-in-dashboard"
                onClick={handlePlaceInDashboard}
                disabled={placing || declining || !dashboardExists}
                title={!dashboardExists ? `"${returnTo.dashboard}" no longer exists` : undefined}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {placing ? 'Placing…' : `Place in ${returnTo.dashboard}`}
              </button>
            </div>
          </div>
        )}

        {placeError && (
          <p
            data-testid="exploration-promote-place-error"
            className="mt-2 text-xs text-highlight-600 bg-highlight-50 border border-highlight-200 rounded-md px-2.5 py-1.5"
          >
            {placeError}
          </p>
        )}

        {/* ux-audit.md "post-promote offers never appear" finding
            (⚠ conflicts-with-e2e — promote-roundtrip #9): the fallback for
            the common case — a chart was promoted but no return_to intent
            was ever armed — so the promote -> dashboard round-trip still has
            an exit ramp from the ordinary Save-to-Project flow, not just the
            "+ New Chart from an open dashboard" entry point. */}
        {promotedThisRun && showFallbackDashboardOffer && (
          <div
            data-testid="exploration-promote-fallback-dashboard-offer"
            className="mt-3 flex items-center justify-between gap-2 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-2"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-primary-800">
              Add <span className="font-medium">{promotedChart.name}</span> to
              <Select
                data-testid="exploration-promote-fallback-dashboard-select"
                value={fallbackDashboardName}
                onChange={setFallbackDashboardName}
                disabled={fallbackPlacing}
                size="sm"
                isSearchable={false}
                options={dashboards.map(d => ({ value: d.name, label: d.name }))}
                className="min-w-[7rem]"
              />
              ?
            </span>
            <button
              type="button"
              data-testid="exploration-promote-fallback-place"
              onClick={handleFallbackPlace}
              disabled={fallbackPlacing || !fallbackDashboardName}
              className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fallbackPlacing ? 'Adding…' : 'Add'}
            </button>
          </div>
        )}

        {fallbackPlaceError && (
          <p
            data-testid="exploration-promote-fallback-place-error"
            className="mt-2 text-xs text-highlight-600 bg-highlight-50 border border-highlight-200 rounded-md px-2.5 py-1.5"
          >
            {fallbackPlaceError}
          </p>
        )}

        {declineError && (
          <p
            data-testid="exploration-promote-decline-error"
            className="mt-2 text-xs text-highlight-600 bg-highlight-50 border border-highlight-200 rounded-md px-2.5 py-1.5"
          >
            {declineError}
          </p>
        )}

        {/* VIS-1069 — Semantic Layer reciprocal: promoting a metric/dimension
            offers a one-click jump to the ERD, focused on that field's
            parent model node. */}
        {promotedThisRun && promotedField && (
          <div
            data-testid="exploration-promote-semantic-layer-offer"
            className="mt-3 flex items-center justify-between gap-2 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-2"
          >
            <span className="text-xs text-primary-800">
              View <span className="font-medium">{promotedField.name}</span> in the Semantic Layer?
            </span>
            <button
              type="button"
              data-testid="exploration-promote-view-in-semantic-layer"
              onClick={handleViewInSemanticLayer}
              className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-700"
            >
              View in Semantic Layer
            </button>
          </div>
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
