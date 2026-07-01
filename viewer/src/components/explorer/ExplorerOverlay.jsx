import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PiX, PiArrowsClockwise } from 'react-icons/pi';
import useStore from '../../stores/store';
import { getTypeColors } from '../views/common/objectTypeConfigs';
import { emitWorkspaceEvent } from '../views/workspace/telemetry';
import { ExplorerRoundTripProvider } from './ExplorerRoundTripContext';
import ExplorerPage from './ExplorerPage';

/**
 * ExplorerOverlay — VIS-778 / J-2.
 *
 * Renders the existing Explorer surface as a modal overlay OVER Build mode for
 * the "+ New Chart" / "+ New Insight" round-trip. Mounted at
 * `/workspace/dashboard/:dashboardName/explorer?return_to=workspace&slot=<r>:<i>`.
 *
 * Framing (the only thing this wave adds — Explorer's surface is unchanged):
 *   - A dimmed backdrop so the canvas underneath stays visible (origin context).
 *   - A bordered + shadowed card that reads as "inside Build mode", not a
 *     navigation away.
 *   - An origin breadcrumb: "Adding to dashboard <name> · slot <slot>".
 *   - "Save and place in slot" (via ExplorerRoundTripContext) replaces the
 *     standard Save; on success the Insight + wrapping Chart are persisted and
 *     the Chart lands in the originating slot, then the overlay closes.
 *   - Cancel / the close button / Esc return to Build mode without placing.
 */

const slotLabel = slot => {
  if (!slot || slot === 'new') return 'a new row';
  const [row, item] = String(slot).split(':');
  if (item === 'end' || item === undefined) return `end of row ${Number(row) + 1}`;
  return `row ${Number(row) + 1}, position ${Number(item) + 1}`;
};

const ExplorerOverlay = () => {
  const navigate = useNavigate();
  const { dashboardName } = useParams();
  const [searchParams] = useSearchParams();
  const slot = searchParams.get('slot') || 'new';

  const saveExplorerObjects = useStore(s => s.saveExplorerObjects);
  const placeChartInDashboardSlot = useStore(s => s.placeChartInDashboardSlot);
  const chartName = useStore(s => s.explorerChartName);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const close = useCallback(() => {
    navigate(`/workspace/dashboard/${encodeURIComponent(dashboardName)}`);
  }, [navigate, dashboardName]);

  // Esc dismisses (same as Cancel).
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape' && !saving) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, saving]);

  const handleSaveAndPlace = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveExplorerObjects();
      if (!result.success) {
        const messages = result.errors.map(e => `${e.type} "${e.name}": ${e.error}`);
        setError(messages.join('; ') || 'Save failed');
        setSaving(false);
        return;
      }
      if (!chartName) {
        setError('No chart to place — build an insight first.');
        setSaving(false);
        return;
      }
      const placed = await placeChartInDashboardSlot(dashboardName, chartName, slot);
      if (!placed.success) {
        setError(placed.error || 'Could not place the chart on the dashboard.');
        setSaving(false);
        return;
      }
      emitWorkspaceEvent('explorer_roundtrip_placed', { dashboardName, chartName, slot });
      navigate(
        `/workspace/dashboard/${encodeURIComponent(dashboardName)}?newItem=${encodeURIComponent(
          chartName
        )}`
      );
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
      setSaving(false);
    }
  }, [
    saveExplorerObjects,
    placeChartInDashboardSlot,
    chartName,
    dashboardName,
    slot,
    navigate,
  ]);

  const dashColors = getTypeColors('dashboard');

  return (
    <div
      data-testid="explorer-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-10"
    >
      {/* Backdrop — dim the origin canvas enough that the framed card clearly
          reads as an overlay ON TOP of Build mode (not a navigation away), while
          still letting the dashboard show through around the edges. */}
      <button
        type="button"
        aria-label="Close Explorer overlay"
        data-testid="explorer-overlay-backdrop"
        className="absolute inset-0 bg-secondary-900/50"
        onClick={() => !saving && close()}
      />

      {/* Framed card — a prominent mulberry border, a visible dimmed margin
          (the card never fills the full viewport), and a ring+shadow make it
          read as "inside Build mode". */}
      <div
        data-testid="explorer-overlay-card"
        className="relative flex h-full max-h-[94vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-xl border-2 border-primary-400 bg-white shadow-2xl ring-1 ring-primary-900/10"
        role="dialog"
        aria-modal="true"
        aria-label="Create a chart for your dashboard"
      >
        {/* Origin breadcrumb bar. */}
        <div className="flex items-center justify-between gap-3 border-b border-secondary-200 bg-primary-50 px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-secondary-700">
            <span className="text-secondary-500">Adding to dashboard</span>
            <span
              data-testid="explorer-overlay-dashboard"
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${dashColors.bg} ${dashColors.text} ${dashColors.border}`}
            >
              {dashboardName}
            </span>
            <span className="text-secondary-300">·</span>
            <span data-testid="explorer-overlay-slot" className="text-secondary-500">
              slot {slotLabel(slot)}
            </span>
          </div>
          <button
            type="button"
            data-testid="explorer-overlay-close"
            disabled={saving}
            onClick={close}
            title="Cancel and return to dashboard"
            aria-label="Cancel and return to dashboard"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-secondary-900 disabled:opacity-50"
          >
            <PiX size={16} />
          </button>
        </div>

        {error && (
          <div
            data-testid="explorer-overlay-error"
            className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* The existing Explorer surface — UNCHANGED — inside the frame. The
            round-trip context swaps its Save button for "Save and place in
            slot" and disables the surface while placing. */}
        <div
          className={`relative min-h-0 flex-1 ${saving ? 'pointer-events-none opacity-60' : ''}`}
          aria-busy={saving}
        >
          <ExplorerRoundTripProvider
            value={{ dashboardName, slot, saving, onSaveAndPlace: handleSaveAndPlace }}
          >
            <ExplorerPage />
          </ExplorerRoundTripProvider>
          {saving && (
            <div
              data-testid="explorer-overlay-saving"
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="inline-flex items-center gap-2 rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-secondary-700 shadow">
                <PiArrowsClockwise className="animate-spin" size={16} />
                Saving and placing on dashboard…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExplorerOverlay;
