import React from 'react';
import { PiArrowsClockwise, PiX } from 'react-icons/pi';

/**
 * ExplorationStalenessBanner — Explore 2.0 Phase 5 (VIS-1070,
 * 02-architecture.md §8 / 01-ux-spec.md §2's "⚠ stale (orders changed)"
 * end-state). Rendered by `ExplorationPane` above the workbench whenever the
 * resume-time staleness check (`explorationStaleness.js`'s
 * `computeExplorationStaleness`, run once on activate) finds a dangling ref.
 *
 * Deliberately NON-BLOCKING (unlike `ExplorationDeletedRemotelyBanner`,
 * which reflects a hard failure state — the record can no longer save at
 * all): a stale ref doesn't stop anything from working, it's informational
 * with a one-click "re-check" action. Purely presentational — the parent
 * owns the staleness computation/state so `onRecheck` can re-run it against
 * the CURRENT live store without this component needing its own store
 * wiring.
 */
const ExplorationStalenessBanner = ({ danglingRefs = [], driftedFrom = null, onRecheck, onDismiss }) => (
  <div
    role="status"
    data-testid="exploration-staleness-banner"
    className="flex w-full shrink-0 items-start gap-3 border-b border-primary-200 bg-primary-50 px-4 py-2.5"
  >
    <PiArrowsClockwise aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
    <div className="min-w-0 flex-1 text-[12.5px]">
      <p className="font-medium text-primary-900">Some referenced objects may have changed.</p>
      {/* Phase 6c-T1 (ux-audit.md existing-objects #8): the drift line —
          the seeded-from object still exists but was edited elsewhere since
          this copy was made — is distinct from, and additive with, the
          dangling-ref line below. */}
      {driftedFrom && (
        <p className="mt-0.5 text-primary-800" data-testid="exploration-staleness-drift">
          <span className="font-mono">{driftedFrom.name}</span> changed in the project since this
          copy was made.
        </p>
      )}
      {danglingRefs.length > 0 && (
        <p className="mt-0.5 text-primary-800">
          No longer resolves: <span className="font-mono">{danglingRefs.join(', ')}</span>
        </p>
      )}
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={onRecheck}
          data-testid="exploration-staleness-recheck"
          className="rounded bg-primary-600 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-primary-700"
        >
          Re-check references
        </button>
      </div>
    </div>
    <button
      type="button"
      aria-label="Dismiss"
      onClick={onDismiss}
      data-testid="exploration-staleness-dismiss"
      className="text-primary-400 transition-colors hover:text-primary-700"
    >
      <PiX size={14} />
    </button>
  </div>
);

export default ExplorationStalenessBanner;
