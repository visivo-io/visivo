import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../../../stores/store';
import { parseRefValue } from '../../../../utils/refString';
import { useWorkspaceCommit } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import {
  wrapItemInContainer,
  unwrapTrivialContainer,
  isTriviallyWrappedContainer,
  addRowInsideContainer,
  addItemToRow,
  parseCanvasPath,
} from './canvasReorder';

/**
 * CanvasContextMenu — VIS-781 / Track D D-5.
 *
 * The right-click context menu for the Workspace dashboard canvas. A SIBLING
 * over the render-only <Dashboard> (mounted by ProjectCanvas alongside the
 * selection / DnD / resize overlays), it listens for `contextmenu` on the canvas
 * root, resolves the right-clicked row/item via the same composite
 * `data-canvas-path` markers the selection overlay reads, and offers the D-5
 * structural actions:
 *
 *   - Wrap in container   (leaf item)      → wrapItemInContainer
 *   - Add item to row      (any row)        → addItemToRow
 *   - Add row inside       (container item) → addRowInsideContainer
 *   - Unwrap container     (trivial 1×1)    → unwrapTrivialContainer
 *
 * Each action commits through the shell's shared `commitCanvasConfig`
 * (optimistic → validate → save) — the SAME path the DnD router + Add-Row menu use — and
 * fires a `canvas_action` telemetry event. There is NO depth limit (Q12): a leaf
 * can be wrapped arbitrarily deep with no warning.
 *
 * Mulberry (`primary`) is the active/selection colour; type colours (for the
 * future per-type menu chrome) come from objectTypeConfigs.js — none are
 * hand-rolled here.
 */

const MULBERRY = 'var(--color-primary-500)';

// Classify a composite key as item / row / chrome (mirrors the selection
// overlay's kindForKey).
const kindForKey = key => {
  if (!key || key === 'dashboard') return 'chrome';
  const parts = key.split('.');
  return parts[parts.length - 2] === 'item' ? 'item' : 'row';
};

// Is the item at `key` a container (Item.rows non-empty)? Read off the live
// config rather than the DOM so the menu actions match what will persist.
const isContainerItem = (config, key) => {
  const segments = parseCanvasPath(key);
  if (!segments.length || segments[segments.length - 1].kind !== 'item') return false;
  let rows = Array.isArray(config?.rows) ? config.rows : null;
  let item = null;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.kind === 'row') {
      if (!rows || !rows[seg.index]) return false;
      rows = Array.isArray(rows[seg.index].items) ? rows[seg.index].items : null;
    } else {
      if (!rows || !rows[seg.index]) return false;
      item = rows[seg.index];
      rows = Array.isArray(item.rows) ? item.rows : null;
    }
  }
  return !!item && Array.isArray(item.rows) && item.rows.length > 0;
};

// Walk the config to the leaf item addressed by an item key, then resolve the
// chart/table subject it carries: `{ type, name }` or null (container / empty /
// non-chart leaf). Used by "Open in Explorer" (VIS-782 / J-3) — only chart and
// table leaves have a model+insight worth opening in Explorer.
const explorerSubjectAtKey = (config, key) => {
  const segments = parseCanvasPath(key);
  if (!segments.length || segments[segments.length - 1].kind !== 'item') return null;
  let rows = Array.isArray(config?.rows) ? config.rows : null;
  let item = null;
  for (const seg of segments) {
    if (seg.kind === 'row') {
      if (!rows || !rows[seg.index]) return null;
      rows = Array.isArray(rows[seg.index].items) ? rows[seg.index].items : null;
    } else {
      if (!rows || !rows[seg.index]) return null;
      item = rows[seg.index];
      rows = Array.isArray(item.rows) ? item.rows : null;
    }
  }
  if (!item || (Array.isArray(item.rows) && item.rows.length > 0)) return null;
  for (const type of ['chart', 'table']) {
    const raw = item[type];
    if (raw == null || raw === '') continue;
    const name = typeof raw === 'string' ? parseRefValue(raw) : raw.name || raw.path;
    if (name) return { type, name };
  }
  return null;
};

// The ROW path that owns the item at an item key (for "Add item to row" from an
// item right-click): drop the trailing `item.<n>` segment.
const rowPathForItemKey = key => {
  const segments = parseCanvasPath(key);
  if (!segments.length || segments[segments.length - 1].kind !== 'item') return null;
  return segments
    .slice(0, -1)
    .map(s => `${s.kind}.${s.index}`)
    .join('.');
};

// The item path of the NEAREST CONTAINER ancestor of `key` (an enclosing
// `Item.rows`), or null. Right-clicking a leaf that fills its container's slot
// resolves (innermost-wins) to the leaf; this lets the menu still offer the
// enclosing container's actions (Add row inside / Unwrap) without the user
// having to hit the container's thin chrome. A container key returns itself.
const containerAncestorPath = (config, key) => {
  const segments = parseCanvasPath(key);
  if (!segments.length) return null;
  // Walk outward from the deepest item, returning the first item path that is
  // itself a container (the key itself counts if it's a container).
  for (let end = segments.length; end >= 2; end -= 1) {
    if (segments[end - 1].kind !== 'item') continue;
    const path = segments
      .slice(0, end)
      .map(s => `${s.kind}.${s.index}`)
      .join('.');
    if (isContainerItem(config, path)) return path;
  }
  return null;
};

const MenuItem = ({ testid, label, hint, onClick, danger }) => (
  <button
    type="button"
    role="menuitem"
    data-testid={testid}
    onClick={onClick}
    className="flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-[12.5px] text-gray-700 transition-colors hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
    style={danger ? { color: 'var(--color-highlight-600)' } : undefined}
  >
    <span className="font-medium">{label}</span>
    {hint && <span className="text-[10.5px] text-gray-400">{hint}</span>}
  </button>
);

const CanvasContextMenu = ({ rootRef, dashboardName }) => {
  const navigate = useNavigate();
  const dashboards = useStore(s => s.dashboards);
  const setWorkspaceSelection = useStore(s => s.setWorkspaceSelection);
  // Selection routed through the unified action (VIS-994). No revealEdit:
  // a right-click's intent is the context menu, not the Edit panel.
  const setSelectedKey = useCallback(
    key => setWorkspaceSelection(undefined, key),
    [setWorkspaceSelection]
  );
  const openWorkspaceTab = useStore(s => s.openWorkspaceTab);
  const openWorkspaceTabBackground = useStore(s => s.openWorkspaceTabBackground);
  const commitCanvasConfig = useWorkspaceCommit();
  // menu: null | { x, y, key, kind }
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);

  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  // Resolve a right-click to a row/item key via the innermost data-canvas-path.
  const onContextMenu = useCallback(
    e => {
      const root = rootRef.current;
      if (!root || !root.contains(e.target)) return;
      const el = e.target.closest('[data-canvas-path]');
      const key = el && root.contains(el) ? el.getAttribute('data-canvas-path') : null;
      const kind = kindForKey(key);
      // Only offer the menu for a real row/item target (chrome right-click falls
      // through to the browser default so the canvas background stays neutral).
      if (!key || kind === 'chrome') return;
      e.preventDefault();
      // Right-click also selects (matches the left-click selection contract).
      if (setSelectedKey) setSelectedKey(key);
      const rootRect = root.getBoundingClientRect();
      setMenu({ x: e.clientX - rootRect.left, y: e.clientY - rootRect.top, key, kind });
    },
    [rootRef, setSelectedKey]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    root.addEventListener('contextmenu', onContextMenu);
    return () => root.removeEventListener('contextmenu', onContextMenu);
  }, [rootRef, onContextMenu]);

  // Dismiss on outside click / Escape / scroll.
  useEffect(() => {
    if (!menu) return undefined;
    const onDocPointer = e => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setMenu(null);
    };
    const onKey = e => {
      if (e.key === 'Escape') setMenu(null);
    };
    const onScroll = () => setMenu(null);
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu]);

  const commit = useCallback(
    (nextConfig, kind, extra) => {
      if (!dashboardName || typeof commitCanvasConfig !== 'function') return;
      if (nextConfig === dashboardConfig) {
        setMenu(null);
        return;
      }
      commitCanvasConfig(dashboardName, nextConfig, { kind });
      emitWorkspaceEvent('canvas_action', { kind, dashboardName, ...extra });
      setMenu(null);
    },
    [dashboardName, commitCanvasConfig, dashboardConfig]
  );

  const openInExplorer = useCallback(
    subject => {
      if (!subject) return;
      const params = new URLSearchParams();
      // The deep-load target — Explorer reads `?insight=` / engineering routing
      // hydrates the chart's model + insight (out of scope for J-3 framing).
      params.set(subject.type === 'table' ? 'table' : 'insight', subject.name);
      params.set('return_to', 'workspace');
      if (dashboardName) params.set('dashboard', dashboardName);
      emitWorkspaceEvent('open_in_explorer', {
        dashboardName,
        subjectType: subject.type,
        subjectName: subject.name,
      });
      setMenu(null);
      navigate(`/explorer?${params.toString()}`);
    },
    [navigate, dashboardName]
  );

  // VIS-811 / O-2: open the right-clicked leaf's object as a workspace tab.
  // "Open" replaces the current context (focus moves); "Open in new tab"
  // background-opens so the dashboard tab keeps focus.
  const openAsTab = useCallback(
    (subject, background) => {
      if (!subject) return;
      const tab = {
        id: `${subject.type}:${subject.name}`,
        type: subject.type,
        name: subject.name,
      };
      if (background) {
        if (openWorkspaceTabBackground) openWorkspaceTabBackground(tab);
      } else if (openWorkspaceTab) {
        openWorkspaceTab(tab);
      }
      setMenu(null);
    },
    [openWorkspaceTab, openWorkspaceTabBackground]
  );

  if (!dashboardConfig || !menu) return null;

  const isContainer = menu.kind === 'item' && isContainerItem(dashboardConfig, menu.key);
  // "Open in Explorer" subject — a chart/table leaf carries a model+insight.
  const explorerSubject =
    menu.kind === 'item' ? explorerSubjectAtKey(dashboardConfig, menu.key) : null;
  // A leaf can be wrapped. (A container is not a leaf.)
  const isLeaf = menu.kind === 'item' && !isContainer;
  // Container actions target the nearest container ancestor — the clicked key
  // itself if it's a container, else the enclosing container of a leaf that fills
  // its slot (so "Add row inside" / "Unwrap" are reachable without hitting the
  // container's thin chrome).
  const containerPath =
    menu.kind === 'item' ? containerAncestorPath(dashboardConfig, menu.key) : null;
  const canUnwrap = !!containerPath && isTriviallyWrappedContainer(dashboardConfig, containerPath);
  // "Add item to row" targets: an item's parent row, or a row directly.
  const addItemRowPath = menu.kind === 'item' ? rowPathForItemKey(menu.key) : menu.key;

  return (
    <div
      data-testid="canvas-context-menu"
      ref={menuRef}
      role="menu"
      aria-label="Canvas item actions"
      className="absolute z-50 min-w-[200px] rounded-lg border border-primary-100 bg-white p-1 shadow-lg"
      style={{ top: menu.y, left: menu.x }}
    >
      <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {menu.kind === 'item' ? (isContainer ? 'Container' : 'Item') : 'Row'}
      </div>

      {explorerSubject && (
        <>
          <MenuItem
            testid="canvas-ctx-open"
            label="Open"
            hint="tab"
            onClick={() => openAsTab(explorerSubject, false)}
          />
          <MenuItem
            testid="canvas-ctx-open-new-tab"
            label="Open in new tab"
            hint="⌘↵"
            onClick={() => openAsTab(explorerSubject, true)}
          />
          <MenuItem
            testid="canvas-ctx-open-in-explorer"
            label="Open in Explorer"
            hint="↗"
            onClick={() => openInExplorer(explorerSubject)}
          />
          <div className="my-1 h-px bg-primary-50" />
        </>
      )}

      {isLeaf && (
        <MenuItem
          testid="canvas-ctx-wrap"
          label="Wrap in container"
          hint="⤳ rows"
          onClick={() =>
            commit(wrapItemInContainer(dashboardConfig, menu.key), 'wrap_in_container', {
              path: menu.key,
            })
          }
        />
      )}

      {containerPath && (
        <MenuItem
          testid="canvas-ctx-add-row-inside"
          label="Add row inside"
          onClick={() =>
            commit(addRowInsideContainer(dashboardConfig, containerPath), 'add_row_inside', {
              path: containerPath,
            })
          }
        />
      )}

      {addItemRowPath && (
        <MenuItem
          testid="canvas-ctx-add-item"
          label="Add item to row"
          onClick={() =>
            commit(addItemToRow(dashboardConfig, addItemRowPath), 'add_item_to_row', {
              path: addItemRowPath,
            })
          }
        />
      )}

      {canUnwrap && (
        <>
          <div className="my-1 h-px bg-primary-50" />
          <MenuItem
            testid="canvas-ctx-unwrap"
            label="Unwrap container"
            hint="→ item"
            onClick={() =>
              commit(unwrapTrivialContainer(dashboardConfig, containerPath), 'unwrap_container', {
                path: containerPath,
              })
            }
          />
        </>
      )}

      {/* A pointer-events sink so the mulberry accent reads as the active menu. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-px top-2 h-4 w-[3px] rounded-r"
        style={{ background: MULBERRY }}
      />
    </div>
  );
};

export default CanvasContextMenu;
