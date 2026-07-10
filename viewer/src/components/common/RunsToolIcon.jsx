import React from 'react';
import { PiListChecks } from 'react-icons/pi';
import { FiLoader } from 'react-icons/fi';
import useStore from '../../stores/store';

/**
 * Icon for the "Runs" tab. Spins (a loader) while a draft run is in flight,
 * tints red when the latest run failed, and is the plain checklist otherwise —
 * so run status lives on the tab itself (no separate "Running…" pill). Kept in
 * lockstep with core's bootstrap/RunsToolIcon so the local viewer and the
 * cloud editor show run status the same way.
 */
export default function RunsToolIcon({ size = 16 }) {
  // Backend-owned status: the run is created `queued` on edit and the runner
  // flips it to `running` on actual start, so the icon just reflects the real
  // state — queued/running spin (queued the moment you edit), failed tints red.
  const state = useStore(s => s.latestRun?.state);

  if (state === 'queued' || state === 'running') {
    return (
      <FiLoader
        size={size}
        className="animate-spin"
        title={state === 'queued' ? 'Queued…' : 'Running…'}
      />
    );
  }
  return <PiListChecks size={size} color={state === 'failed' ? '#e06b5b' : undefined} />;
}
