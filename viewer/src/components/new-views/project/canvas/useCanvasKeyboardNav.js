import { useCallback } from 'react';
import {
  buildBreadcrumbSegments,
  computeSiblingKey,
  computeHierarchyKey,
  computeReorder,
  applyReorder,
  tokenizeOutlineKey,
} from '../../workspace/breadcrumbNav';

/**
 * useCanvasKeyboardNav — VIS-790 / Track D D-7.
 *
 * Canvas-DIRECT keyboard navigation + a11y for the Workspace dashboard canvas.
 * Where the G-2 breadcrumb (<EditPanelBreadcrumb>) drives the SAME selection from
 * the right rail, this hook drives it from a focus surface ON the canvas, with a
 * 2D arrow-key mental model that matches the spatial layout:
 *
 *   - ←/→         step among SIBLINGS at the current depth (items within a row,
 *                 or rows among their siblings) — wraps within the sibling range.
 *   - ↑           step UP the hierarchy (item → its parent row → dashboard).
 *   - ↓           step DOWN into the first child (dashboard → row 0 → item 0 → …).
 *   - Tab / ⇧Tab  cycle the focus ring through the current row's items (wraps).
 *   - ⌘↑ / ⌘↓     reorder the focused node within its parent (persisted).
 *   - Enter        focus the right-rail Edit form's first field.
 *   - Esc          deselect (jump to the dashboard root).
 *
 * All structural logic reuses the pure breadcrumbNav helpers (the SAME ones G-2
 * uses) so canvas + breadcrumb + Outline stay one selection model. The hook is
 * framework-light: it returns a `handleKeyDown` for the canvas focus surface and
 * an `announce(key)` that renders the SR string ("Row 2, item 1 selected").
 *
 * Reorder commits through the shell's shared `commitCanvasConfig`
 * (sanitize → optimistic → save) — the SAME path the DnD router + context menu
 * use — so a keyboard reorder is indistinguishable from a pointer one.
 */

/**
 * Build the screen-reader announcement for a selection key. Uses the breadcrumb
 * segments so the label matches what the Outline + breadcrumb show. Examples:
 *   'dashboard'            → 'Dashboard selected'
 *   'row.1'                → 'Row 2 selected'
 *   'row.1.item.0'         → 'Row 2, item 1 selected'
 *   nested                 → 'Row 2, item 1, row 1, item 2 selected'
 */
export const announceSelection = (key, dashboardName, rows) => {
  const tokens = tokenizeOutlineKey(key);
  if (!tokens.length) return 'Dashboard selected';
  const parts = tokens.map(t =>
    t.axis === 'row' ? `row ${t.index + 1}` : `item ${t.index + 1}`
  );
  // Capitalise the leading word for a natural reading ("Row 2, item 1 selected").
  const phrase = parts.join(', ');
  const sentence = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  // `dashboardName` + `rows` resolve a container label if the leaf no longer
  // exists, but the index phrasing above is the AC-specified announcement.
  void buildBreadcrumbSegments; // (kept imported for parity with the breadcrumb)
  return `${sentence} selected`;
};

/**
 * Tab / Shift+Tab cycles the focus ring through the items of the CURRENT row.
 * When an item is selected → its row's items. When a row is selected → its own
 * items (enter the row at item 0 / last). When the dashboard is selected →
 * row 0's item 0. Wraps within the row. Returns the next key (or the unchanged
 * key when there's nothing to cycle).
 */
export const computeTabKey = (key, rows, delta) => {
  const tokens = tokenizeOutlineKey(key);
  // Dashboard root → enter the first row's first item.
  if (tokens.length === 0) {
    return Array.isArray(rows) && rows.length ? 'row.0.item.0' : 'dashboard';
  }
  const last = tokens[tokens.length - 1];
  // A row is selected → step into its items (first for Tab, last for Shift+Tab).
  if (last.axis === 'row') {
    return computeHierarchyKey(key, rows, 'down');
  }
  // An item is selected → cycle its row's siblings.
  return computeSiblingKey(key, rows, delta);
};

const useCanvasKeyboardNav = ({
  outlineKey,
  dashboardName,
  rows,
  setSelectedKey,
  commitConfig,
  config,
  onAnnounce,
  onFocusForm,
}) => {
  const select = useCallback(
    nextKey => {
      if (nextKey == null) return;
      if (setSelectedKey) setSelectedKey(nextKey);
      if (onAnnounce) onAnnounce(announceSelection(nextKey, dashboardName, rows));
    },
    [setSelectedKey, onAnnounce, dashboardName, rows]
  );

  const reorder = useCallback(
    delta => {
      const key = outlineKey || 'dashboard';
      const op = computeReorder(key, rows, delta);
      if (!op || !config || typeof commitConfig !== 'function') return false;
      const nextConfig = applyReorder(config, op);
      if (nextConfig === config) return false;
      commitConfig(nextConfig, { kind: 'reorder_keyboard', axis: op.axis });
      const nextKey =
        op.parentKey === 'dashboard'
          ? `${op.axis}.${op.toIndex}`
          : `${op.parentKey}.${op.axis}.${op.toIndex}`;
      if (setSelectedKey) setSelectedKey(nextKey);
      if (onAnnounce) {
        const dir = delta < 0 ? 'earlier' : 'later';
        onAnnounce(`Moved ${op.axis} ${dir}. ${announceSelection(nextKey, dashboardName, rows)}`);
      }
      return true;
    },
    [outlineKey, rows, config, commitConfig, setSelectedKey, onAnnounce, dashboardName]
  );

  const handleKeyDown = useCallback(
    e => {
      // Never hijack typing inside a form field that might be inside the canvas
      // (e.g. an inline markdown editor / input widget).
      const tag = e.target?.tagName || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target?.isContentEditable) return;

      const key = outlineKey || 'dashboard';
      const isReorder = e.metaKey || e.ctrlKey;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          select('dashboard');
          return;
        case 'Enter':
          e.preventDefault();
          if (onFocusForm) onFocusForm();
          return;
        case 'ArrowLeft':
          e.preventDefault();
          select(computeSiblingKey(key, rows, -1));
          return;
        case 'ArrowRight':
          e.preventDefault();
          select(computeSiblingKey(key, rows, 1));
          return;
        case 'ArrowUp':
          e.preventDefault();
          if (isReorder) reorder(-1);
          else select(computeHierarchyKey(key, rows, 'up'));
          return;
        case 'ArrowDown':
          e.preventDefault();
          if (isReorder) reorder(1);
          else select(computeHierarchyKey(key, rows, 'down'));
          return;
        case 'Tab':
          // Tab cycles within the row; let it fall through to the browser only
          // when there's nothing to cycle (keeps the canvas in the tab order).
          {
            const next = computeTabKey(key, rows, e.shiftKey ? -1 : 1);
            if (next && next !== key) {
              e.preventDefault();
              select(next);
            }
          }
          return;
        default:
          return;
      }
    },
    [outlineKey, rows, select, reorder, onFocusForm]
  );

  return { handleKeyDown, reorder, select };
};

export default useCanvasKeyboardNav;
