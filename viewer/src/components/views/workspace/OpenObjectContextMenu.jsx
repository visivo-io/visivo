import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PiArrowSquareOut, PiArrowRight, PiCompass, PiPlusCircle } from 'react-icons/pi';
import { getTypeIcon } from '../common/objectTypeConfigs';

/**
 * OpenObjectContextMenu — VIS-811 / Track O O-2 (+ VIS-1067 flywheel entries).
 *
 * The shared right-click menu for "openable" workspace objects. Mounted by
 * surfaces that don't already own a context menu (lineage nodes, Project
 * Editor tiles); the canvas and Library menus integrate the same actions
 * into their existing menus instead.
 *
 *   - Open             → replaces the current workspace context
 *                        (`openWorkspaceTab` — focuses/creates the tab).
 *   - Open in new tab  → background-opens (`openWorkspaceTabBackground`) so
 *                        the user's current tab keeps focus; the new tab
 *                        joins the strip ready to click. This matches the
 *                        Track O spec ("creates a new tab; clicking the tab
 *                        switches the workspace context").
 *   - Explore this     → (VIS-1067, optional — only rendered when the
 *                        consumer passes `onExploreThis`) mints a new
 *                        exploration seeded from this object and opens it.
 *   - Add to exploration → (VIS-1067, optional — only rendered when the
 *                        consumer passes `onAddToExploration`, which callers
 *                        gate on an exploration tab actually being open)
 *                        adds this object into the active exploration's
 *                        draft without leaving the current tab.
 *
 * Rendered through a portal at a fixed viewport position (`x`/`y` are
 * clientX/clientY) so it escapes any overflow-clipping ancestor (the lineage
 * pane, the editor's scroll container). Dismisses on outside pointer-down,
 * Escape, or scroll — same contract as CanvasContextMenu.
 */
const MULBERRY = 'var(--color-primary-500)';

const MenuItem = ({ testid, icon: Icon, label, onClick }) => (
  <button
    type="button"
    role="menuitem"
    data-testid={testid}
    onClick={e => {
      // React portals bubble through the REACT tree — without this, a menu
      // click would also fire the host's onClick (e.g. a tile's "select").
      e.stopPropagation();
      onClick && onClick(e);
    }}
    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] text-gray-700 transition-colors hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
  >
    {Icon && <Icon className="shrink-0 text-gray-500" style={{ fontSize: 14 }} />}
    <span className="font-medium">{label}</span>
  </button>
);

const OpenObjectContextMenu = ({
  x,
  y,
  obj,
  onOpen,
  onOpenInNewTab,
  onExploreThis,
  onAddToExploration,
  onDismiss,
  testIdPrefix,
}) => {
  const menuRef = useRef(null);
  const prefix = testIdPrefix || 'open-object-ctx';
  const TypeIcon = obj?.type ? getTypeIcon(obj.type) : null;

  useEffect(() => {
    const onDocPointer = e => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      onDismiss && onDismiss();
    };
    const onKey = e => {
      if (e.key === 'Escape') onDismiss && onDismiss();
    };
    const onScroll = () => onDismiss && onDismiss();
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onDismiss]);

  if (!obj) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${obj.name} actions`}
      data-testid={`${prefix}-menu`}
      className="fixed z-[80] min-w-[190px] rounded-lg border border-primary-100 bg-white p-1 shadow-lg"
      style={{ top: y, left: x }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {TypeIcon && <TypeIcon aria-hidden="true" style={{ fontSize: 12 }} />}
        <span className="truncate">{obj.name}</span>
      </div>
      <MenuItem
        testid={`${prefix}-open`}
        icon={PiArrowRight}
        label="Open"
        onClick={() => {
          onOpen && onOpen(obj);
          onDismiss && onDismiss();
        }}
      />
      <MenuItem
        testid={`${prefix}-open-new-tab`}
        icon={PiArrowSquareOut}
        label="Open in new tab"
        onClick={() => {
          onOpenInNewTab && onOpenInNewTab(obj);
          onDismiss && onDismiss();
        }}
      />
      {onExploreThis && (
        <MenuItem
          testid={`${prefix}-explore-this`}
          icon={PiCompass}
          label="Explore this"
          onClick={() => {
            onExploreThis(obj);
            onDismiss && onDismiss();
          }}
        />
      )}
      {onAddToExploration && (
        <MenuItem
          testid={`${prefix}-add-to-exploration`}
          icon={PiPlusCircle}
          label="Add to exploration"
          onClick={() => {
            onAddToExploration(obj);
            onDismiss && onDismiss();
          }}
        />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-px top-2 h-4 w-[3px] rounded-r"
        style={{ background: MULBERRY }}
      />
    </div>,
    document.body
  );
};

export default OpenObjectContextMenu;
