import { useEffect } from 'react';
import useStore from '../../../stores/store';
import { HIGHER_LEVEL_VIEWS } from './higherLevelViews';

/**
 * useWorkspaceTabShortcuts — VIS-812 / Track O O-3; reconciled in Explore 2.0
 * Phase 0 against the new view-switcher shortcuts (01-ux-spec.md §6).
 *
 * Workspace keyboard shortcuts, mounted once by the WorkspaceShell:
 *
 *   - Cmd/Ctrl+T     → new tab (activates the Project destination's Home —
 *                      the Workspace's "empty tab", matching the strip's +
 *                      affordance).
 *   - Cmd/Ctrl+W     → close the active tab THROUGH the dirty guard
 *                      (`requestCloseWorkspaceTab` → confirm dialog if dirty).
 *   - Cmd/Ctrl+1/2/3 → switch to a workspace VIEW (Project / Semantic Layer /
 *                      Explorer, in `higherLevelViews.js` order) — 01-ux-spec.md
 *                      §6's new binding. Chosen over the spec's rejected
 *                      alternative `Cmd+Shift+3/4/5` (those are OS-reserved
 *                      macOS screenshot chords that never reach the browser).
 *   - Cmd/Ctrl+4..9  → switch to the tab at strip position (key − 3).
 *                      RECONCILIATION NOTE: this range previously covered
 *                      1..9 (position 1 = Cmd+1); claiming 1/2/3 for the three
 *                      views meant either dropping tab-position switching down
 *                      to 6 slots or breaking the view shortcuts — reassigning
 *                      the low digits to views and shifting tabs to 4..9 keeps
 *                      BOTH mechanisms live on one numeric range instead of
 *                      losing either.
 *
 * Modifier: metaKey on macOS, ctrlKey elsewhere. Shortcuts are suppressed
 * while focus is in an input / textarea / select / contenteditable so the
 * browser's own editing shortcuts are never clobbered, and any combo with
 * Alt or Shift is left alone (those are browser/system chords).
 *
 * Phase 4 delta (P4-D1): shortcuts are ALSO suppressed while a blocking
 * modal is open (`hasBlockingModal`, below). `ExplorationPromoteModal`'s
 * backdrop already blocks a MOUSE-driven close mid-promote (its own
 * `onClick` checks `!promoting`), but every shortcut here (T/W/1-9) can
 * navigate away from — and thereby unmount — the active exploration tab
 * regardless: `ExplorationPane`'s deactivate cleanup fires a generic
 * draft-sync flush that races `promoteExploration`'s in-flight
 * `recordExplorationPromotion` POST on the same unlocked backend JSON
 * document (see `workspaceExplorationsStore.js`'s "WRITE SERIALIZATION"
 * docstring for the other half of this fix — the client-side write queue
 * that makes surviving this race safe even when it isn't preventable, e.g.
 * a mouse click on a different browser tab/window). Suppressing here closes
 * off the KEYBOARD path entirely, matching the mouse backdrop's existing
 * guarantee instead of leaving it as the only door.
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
 * Is a blocking modal currently open? Checked via the DOM rather than a
 * store flag — every blocking modal in this codebase already renders
 * `aria-modal="true"` on its dialog element for a11y (`ConfirmDialog.jsx`,
 * `TabCloseConfirmDialog.jsx`, `ExplorationPromoteModal.jsx`), so this
 * generalizes to any FUTURE blocking modal for free with zero call-site
 * wiring — no modal owner needs to remember to set/clear a store flag,
 * mirroring `isEditableTarget`'s own DOM-based check just above. Exported
 * for tests.
 */
export const hasBlockingModal = () => {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('[aria-modal="true"]');
};

/**
 * The pure keydown handler — exported so tests can drive it without
 * mounting a component. `store` is the zustand state (getState()).
 */
export const handleTabShortcut = (e, store, { mac = isMacPlatform() } = {}) => {
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey || e.shiftKey) return false;
  if (isEditableTarget(e.target)) return false;
  // P4-D1: never navigate away from (and thereby unmount) the active tab
  // while a blocking modal is open — see the file docstring.
  if (hasBlockingModal()) return false;

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
    const n = Number(key);
    if (n <= HIGHER_LEVEL_VIEWS.length) {
      // Cmd/Ctrl+1/2/3 — the three workspace views, fixed registry order.
      const view = HIGHER_LEVEL_VIEWS[n - 1];
      if (view && store.openWorkspaceView) {
        e.preventDefault();
        store.openWorkspaceView(view.key);
        return true;
      }
      return false;
    }
    // Cmd/Ctrl+4..9 — tab position (shifted down by the views claiming 1-3).
    const tab = (store.workspaceTabs || [])[n - HIGHER_LEVEL_VIEWS.length - 1];
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
