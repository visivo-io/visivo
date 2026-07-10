import React from 'react';
import { PiCheckCircle, PiCircleNotch, PiWarningCircle, PiClock } from 'react-icons/pi';

/**
 * SaveStateIndicator — VIS-802 / Track G G-1.
 *
 * The inline auto-save status badge shown in the right-rail Edit form header.
 * There are no Save buttons in the Workspace Edit surface — this badge is the
 * only feedback that a debounced auto-save is in flight / has landed.
 *
 * Maps the `useDebouncedSave` status onto a small label + icon:
 *   - 'pending' → "Unsaved" (clock) — a debounce timer is running.
 *   - 'saving'  → "Saving…" (spinner).
 *   - 'saved'   → "Saved" (green check).
 *   - 'error'   → "Save failed" (highlight/red warning).
 *   - 'invalid' → "Invalid — not saved" (highlight/red warning) — the VIS-993
 *                 validation gate is holding persistence until the config is
 *                 backend-valid again (same status useRecordSave reports).
 *   - 'idle'    → nothing (no recent activity).
 *
 * Colours: mulberry/primary is reserved for SELECTION, so this uses neutral
 * gray for in-flight states, green for success, and the highlight tone for the
 * error — never the primary palette.
 */
const CONFIG = {
  pending: {
    label: 'Unsaved',
    Icon: PiClock,
    className: 'text-gray-500',
    spin: false,
  },
  saving: {
    label: 'Saving…',
    Icon: PiCircleNotch,
    className: 'text-gray-500',
    spin: true,
  },
  saved: {
    label: 'Saved',
    Icon: PiCheckCircle,
    className: 'text-green-600',
    spin: false,
  },
  error: {
    label: 'Save failed',
    Icon: PiWarningCircle,
    className: 'text-highlight',
    spin: false,
  },
  invalid: {
    label: 'Invalid — not saved',
    Icon: PiWarningCircle,
    className: 'text-highlight',
    spin: false,
  },
};

const SaveStateIndicator = ({ status }) => {
  const cfg = CONFIG[status];
  if (!cfg) return null;
  const { label, Icon, className, spin } = cfg;
  return (
    <span
      data-testid="right-rail-save-state"
      data-status={status}
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${className}`}
      aria-live="polite"
    >
      <Icon className={`h-3.5 w-3.5 ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label}
    </span>
  );
};

export default SaveStateIndicator;
