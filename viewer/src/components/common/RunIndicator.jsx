import React from 'react';
import { Link } from 'react-router-dom';
import { FiLoader, FiAlertTriangle } from 'react-icons/fi';
import useStore from '../../stores/store';
import { ACTIVE_RUN_STATES } from '../../stores/runStore';

/**
 * Toolbar run-status indicator. Reads the latest run from the run-poller
 * (runStore.latestRun) and shows a pill while a run is in flight or on failure;
 * renders nothing when idle/succeeded so the bar stays clean. Clicking it opens
 * the Runs view. Works wherever the run-poller is active (local serve once
 * status:"draft" enables it, and cloud).
 */
export default function RunIndicator() {
  const state = useStore(s => s.latestRun?.state);
  if (!state) return null;

  const pill = (children, color, title) => (
    <Link
      to="/runs"
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color,
        fontSize: 12.5,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {children}
    </Link>
  );

  if (ACTIVE_RUN_STATES.includes(state)) {
    return pill(
      <>
        <FiLoader className="animate-spin" size={14} /> Running…
      </>,
      '#cbd0dc',
      'A run is in progress — view runs'
    );
  }

  if (state === 'failed') {
    return pill(
      <>
        <FiAlertTriangle size={14} /> Run failed
      </>,
      '#fca5a5',
      'The latest run failed — view runs'
    );
  }

  return null;
}
