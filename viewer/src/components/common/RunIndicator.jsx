import React from 'react';
import { FiLoader, FiAlertTriangle } from 'react-icons/fi';
import useStore from '../../stores/store';
import { ACTIVE_RUN_STATES } from '../../stores/runStore';

/**
 * Toolbar run-status indicator. Reads the latest run from the run-poller
 * (runStore.latestRun) and shows a pill while a run is in flight or on failure;
 * renders nothing when idle/succeeded so the bar stays clean. Works wherever the
 * run-poller is active (local serve once status:"draft" enables it, and cloud).
 */
export default function RunIndicator() {
  const state = useStore(s => s.latestRun?.state);
  if (!state) return null;

  if (ACTIVE_RUN_STATES.includes(state)) {
    return (
      <span
        title="A run is in progress"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#cbd0dc',
          fontSize: 12.5,
          fontWeight: 500,
        }}
      >
        <FiLoader className="animate-spin" size={14} /> Running…
      </span>
    );
  }

  if (state === 'failed') {
    return (
      <span
        title="The latest run failed"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          color: '#fca5a5',
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        <FiAlertTriangle size={14} /> Run failed
      </span>
    );
  }

  return null;
}
