import React from 'react';
import { PiListChecks } from 'react-icons/pi';
import { FiLoader } from 'react-icons/fi';
import useStore from '../../stores/store';

/**
 * Icon for the "Runs" tab. Spins (a loader) while a draft run is in flight,
 * tints red when the latest run failed, carries an amber dot when there are
 * changes nobody has run yet, and is the plain checklist otherwise — so run
 * status lives on the tab itself (no separate "Running…" pill).
 *
 * The dot is the only signal that a manual-trigger user has work outstanding:
 * their edits don't start a run, so without it the Run view is somewhere you'd
 * have to think to visit. Amber rather than the mulberry used for an unsaved
 * workspace tab — "saved but not built" is a different state from "not saved".
 */
export default function RunsToolIcon({ size = 16 }) {
  // Backend-owned status: the run is created `queued` on edit and the runner
  // flips it to `running` on actual start, so the icon just reflects the real
  // state — queued/running spin (queued the moment you edit), failed tints red.
  const state = useStore(s => s.latestRun?.state);
  const stagedCount = useStore(s => s.stagedCount);

  if (state === 'queued' || state === 'running') {
    return (
      <FiLoader
        size={size}
        className="animate-spin"
        title={state === 'queued' ? 'Queued…' : 'Running…'}
      />
    );
  }

  const icon = <PiListChecks size={size} color={state === 'failed' ? '#e06b5b' : undefined} />;
  if (!stagedCount) return icon;
  return (
    <span className="relative inline-flex" data-testid="runs-tool-staged-dot">
      {icon}
      <span
        aria-hidden="true"
        title={`${stagedCount} change${stagedCount === 1 ? '' : 's'} not run yet`}
        className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
      />
    </span>
  );
}
