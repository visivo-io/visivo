import { useEffect } from 'react';
import useStore from '../../../stores/store';

/**
 * useWorkspaceTabShortcuts — VIS-812 / Track O O-3.
 *
 * Workspace tab keyboard shortcuts, mounted once by the WorkspaceShell:
 *
 *   - Cmd/Ctrl+T     → new tab (the unscoped project tab — the Workspace's
 *                      "empty tab", matching the strip's + affordance).
 *   - Cmd/Ctrl+W     → close the active tab THROUGH the dirty guard
 *                      (`requestCloseWorkspaceTab` → confirm dialog if dirty).
 *   - Cmd/Ctrl+1..9  → switch to the tab at that strip position.
 *
 * Modifier: metaKey on macOS, ctrlKey elsewhere. Shortcuts are suppressed
 * while focus is in an input / textarea / select / contenteditable so the
 * browser's own editing shortcuts are never clobbered, and any combo with
 * Alt or Shift is left alone (those are browser/system chords).
 */

/** Mac detection — exported for tests. `navigator.platform` is deprecated but
 *  still the most reliable signal; fall back to the UA string. */
export const isMacPlatform = () => {
  if (typeof navigator === 'undefined') return false;
  const probe = navigator.platform || navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/i.test(probe);
};

/** Should the shortcut layer ignore this event target? Exported for tests. */
export const isEditableTarget = (el) => {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
};

/**
 * The pure keydown handler — exported so tests can drive it without
 * mounting a component. `store` is the zustand state (getState()).
 */
export const handleTabShortcut = (e, store, { mac = isMacPlatform() } = {}) => {
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey || e.shiftKey) return false;
  if (isEditableTarget(e.target)) return false;

  const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';

  if (key === 't') {
    e.preventDefault();
    const project = store.project;
    const projectName = project?.project_json?.name || project?.name || 'project';
    if (store.openWorkspaceTab) {
      store.openWorkspaceTab({
        id: `project:${projectName}`,
        type: 'project',
        name: projectName,
      });
    }
    return true;
  }

  if (key === 'w') {
    e.preventDefault();
    if (store.workspaceActiveTabId && store.requestCloseWorkspaceTab) {
      store.requestCloseWorkspaceTab(store.workspaceActiveTabId);
    }
    return true;
  }

  if (/^[1-9]$/.test(key)) {
    const tab = (store.workspaceTabs || [])[Number(key) - 1];
    if (tab && store.switchWorkspaceTab) {
      e.preventDefault();
      store.switchWorkspaceTab(tab.id);
      return true;
    }
    return false;
  }

  return false;
};

const useWorkspaceTabShortcuts = () => {
  useEffect(() => {
    const onKeyDown = (e) => {
      handleTabShortcut(e, useStore.getState());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};

export default useWorkspaceTabShortcuts;
