import React, { useState } from 'react';
import { PiPencil } from 'react-icons/pi';
import { FiGitBranch } from 'react-icons/fi';
import useStore from '../../stores/store';

const PRIMARY = '#713B57';
const HAIR = 'rgba(255,255,255,.14)';

const btnStyle = (bg, disabled) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: bg,
  color: '#fff',
  border: bg === 'transparent' ? `1px solid ${HAIR}` : 'none',
  fontSize: 13,
  fontWeight: 600,
  padding: '7px 13px',
  borderRadius: 99,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  whiteSpace: 'nowrap',
});

/**
 * Cloud-editing entry (core/Django only). Renders an Edit and/or Branch button
 * based on the user's capabilities for the active project's stage:
 *   - can_edit   → Edit  (resolve-or-create a draft on the same stage)
 *   - can_branch → Branch (fork onto a new stage)
 * An editor on the default stage gets Branch only (edit_action === 'branch_required').
 *
 * Self-gating: renders null unless `isCloud` (the capabilities probe succeeded).
 * In local `visivo serve` (Flask) the probe 404s, isCloud stays false, and this
 * is invisible — local editing is unchanged.
 */
const CloudEditControls = () => {
  const isCloud = useStore(state => state.isCloud);
  const capabilities = useStore(state => state.capabilities);
  const startEdit = useStore(state => state.startEdit);
  const startBranch = useStore(state => state.startBranch);
  const project = useStore(state => state.project);
  const [busy, setBusy] = useState(false);

  if (!isCloud || !capabilities) return null;
  const { can_edit: canEdit, can_branch: canBranch } = capabilities;
  if (!canEdit && !canBranch) return null;

  const onEdit = async () => {
    setBusy(true);
    try {
      await startEdit();
    } finally {
      setBusy(false);
    }
  };

  const onBranch = async () => {
    // First-pass UX: prompt for the new stage name. A dedicated dialog is a
    // follow-up. fromStage falls back across the envelope shapes core may use.
    const newStageName = window.prompt('Name the new branch stage:');
    if (!newStageName) return;
    setBusy(true);
    try {
      await startBranch({
        fromStage: project?.stage_name || project?.stage || project?.config?.stage,
        projectName: project?.name,
        newStageName,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {canEdit && (
        <button onClick={onEdit} disabled={busy} title="Edit — create a draft" style={btnStyle(PRIMARY, busy)}>
          <PiPencil size={15} /> Edit
        </button>
      )}
      {canBranch && (
        <button onClick={onBranch} disabled={busy} title="Branch — new stage" style={btnStyle('transparent', busy)}>
          <FiGitBranch size={15} /> Branch
        </button>
      )}
    </div>
  );
};

export default CloudEditControls;
