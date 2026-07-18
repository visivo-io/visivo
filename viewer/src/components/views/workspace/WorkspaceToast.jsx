import React from 'react';
import SnackBar from '../../common/SnackBar';
import useStore from '../../../stores/store';

/**
 * WorkspaceToast — the shell's single mount point for `workspaceToast`
 * (`workspaceStore.js`, Explore 2.0 Phase 2). Reuses the app's existing
 * `<SnackBar>` (brand Snackbar) rather than hand-rolling a second toast
 * component. Mounted once at `WorkspaceShell`, above the tab/rail layout, so
 * it stays visible no matter which destination/pane owns the center — the
 * "exploration deleted while its tab was open (even parked)" notice must
 * reach the user even when a DIFFERENT tab is active.
 */
const WorkspaceToast = () => {
  const toast = useStore(s => s.workspaceToast);
  const dismissWorkspaceToast = useStore(s => s.dismissWorkspaceToast);

  return (
    <SnackBar
      key={toast?.key || 'idle'}
      message={toast?.message || ''}
      open={!!toast}
      setOpen={open => {
        if (!open) dismissWorkspaceToast();
      }}
    />
  );
};

export default WorkspaceToast;
