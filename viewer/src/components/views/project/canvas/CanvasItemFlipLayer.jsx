import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiLink } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import useStore from '../../../../stores/store';
import { useWorkspaceDrag } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import { parseRefValue } from '../../../../utils/refString';
import { parseCanvasPath } from './canvasReorder';
import ItemFlipCard from '../../../project/ItemFlipCard';
import ItemActionMenu from '../../../project/ItemActionMenu';
import copyItemLink from '../../../project/copyItemLink';

/**
 * CanvasItemFlipLayer — VIS-785 / Track D D-6 (flip-to-lineage).
 *
 * Per-item action affordance for the Workspace dashboard canvas. A SIBLING over
 * the render-only <Dashboard> (mounted by ProjectCanvas alongside the selection
 * / DnD / resize / keyboard overlays). For the hovered-or-selected leaf item it
 * paints the consolidated mulberry (`primary`) kebab (⋮) — the SAME
 * <ItemActionMenu> View mode uses — anchored to the item's top-right corner.
 * The action list is Copy link + Flip to lineage.
 *
 * ### Controlled open/hover state (mirrors ProjectViewFlipLayer)
 *
 * The kebab lives in this sibling overlay, so reaching for it can clear the
 * canvas hover/selection that spawned it. As in the View layer, the parent owns
 * the kebab's `open` state (`openKey`) and is told when the kebab is hovered
 * (`menuHoverKey`); the kebab stays mounted for the active item, every flipped
 * item, the menu-hovered item, and the open item — so it survives the cursor
 * reach.
 *
 * ### True in-place flip (<ItemFlipCard>)
 *
 * Selecting "Flip to lineage" flips the slot IN PLACE: `<ItemFlipCard>` overlays
 * the slot's OWN box (a CSS-3D rotateY reveal) and renders the shared
 * `<MiniLineageCard>` (the branching ancestors/subject/descendants ladder with
 * the live selector input + Expand-to-lineage footer). The card covers the chart
 * it came from rather than floating beside it.
 *
 * ### Behaviour (D-6 AC)
 *   - Open the kebab → Copy link (copies the slot's deep link) + Flip to lineage.
 *   - Flip → the item's lineage card flips in place over the slot.
 *   - The card shows ancestors + subject + descendants and a live selector input
 *     (defaulted to `+<name>+`); editing it re-walks the lineage.
 *   - Expand → opens a Workspace tab for the subject on the lineage lens.
 *   - Multi-flip: several items can be flipped at once (a Set of flipped keys).
 *   - Disabled during a drag (`useWorkspaceDrag`).
 *   - `prefers-reduced-motion`: the card rotation animation is suppressed (it
 *     degrades to a fade, honored by the OS setting).
 *
 * Mulberry (`primary`) is the affordance colour; the lineage card's per-type
 * colours come from objectTypeConfigs via MiniLineageCard.
 */

const measure = (el, rootEl) => {
  if (!el || !rootEl) return null;
  const node = el.getBoundingClientRect();
  const root = rootEl.getBoundingClientRect();
  return { top: node.top - root.top, left: node.left - root.left, width: node.width, height: node.height };
};

// Resolve the lineage subject `{ type, name }` for a dashboard item, or null for
// a container / empty slot (no single subject to flip to).
const subjectForItem = item => {
  if (!item || typeof item !== 'object') return null;
  if (Array.isArray(item.rows) && item.rows.length > 0) return null; // container
  const carriers = [
    ['chart', item.chart],
    ['table', item.table],
    ['markdown', item.markdown],
    ['input', item.input],
  ];
  for (const [type, raw] of carriers) {
    if (raw == null || raw === '') continue;
    const name = typeof raw === 'string' ? parseRefValue(raw) : raw.name || raw.path;
    if (name) return { type, name };
  }
  return null;
};

// Walk the config to the item addressed by a composite item key.
const itemAtKey = (config, key) => {
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
  return item;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CanvasItemFlipLayer = ({ rootRef, dashboardName }) => {
  const navigate = useNavigate();
  const dashboards = useStore(s => s.dashboards);
  const hoverKey = useStore(s => s.workspaceCanvasHoverKey);
  const selectedKey = useStore(s => s.workspaceOutlineSelectedKey);
  const activeDrag = useWorkspaceDrag();

  // Flipped item keys (multi-flip, Q3b) → each has an open lineage card.
  const [flipped, setFlipped] = useState(() => new Set());
  // The kebab lives in a sibling overlay, so reaching for it can clear the
  // canvas hover/selection. These two keep a menu mounted while its kebab is
  // hovered (menuHoverKey) or its dropdown is open (openKey) — independent of
  // the transient hover/selection key (mirrors ProjectViewFlipLayer).
  const [menuHoverKey, setMenuHoverKey] = useState(null);
  const [openKey, setOpenKey] = useState(null);
  const [tick, setTick] = useState(0); // forces a re-measure on reflow
  const reducedMotion = prefersReducedMotion();

  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  // The item the kebab attaches to: the hovered item, else the selected item
  // (only leaf items with a resolvable subject).
  const activeKey = useMemo(() => {
    const candidate = hoverKey && hoverKey.includes('.item.') ? hoverKey : selectedKey;
    if (!candidate || !candidate.includes('.item.')) return null;
    const item = itemAtKey(dashboardConfig, candidate);
    return subjectForItem(item) ? candidate : null;
  }, [hoverKey, selectedKey, dashboardConfig]);

  // Re-measure on resize/scroll so the kebab + open cards track canvas reflow.
  // The mount tick forces one re-measure once `rootRef.current` is attached, so
  // an item that is already hovered/selected at mount gets a non-null box (the
  // first render runs before the ref is set; boxFor reads the live DOM).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onReflow = () => setTick(t => t + 1);
    onReflow();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onReflow) : null;
    if (ro) ro.observe(root);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [rootRef]);

  const toggleFlip = useCallback(
    key => {
      setFlipped(prev => {
        const next = new Set(prev);
        const willFlip = !next.has(key);
        if (willFlip) next.add(key);
        else next.delete(key);
        const item = itemAtKey(dashboardConfig, key);
        const subject = subjectForItem(item);
        if (willFlip) {
          emitWorkspaceEvent('item_flipped', {
            surface: 'build',
            selector_edited: false,
            expanded_to_modal: false,
            type: subject?.type,
            name: subject?.name,
          });
        }
        return next;
      });
    },
    [dashboardConfig]
  );

  // Expand = "open full lineage in a tab": deep-link to the Workspace with both
  // the `edit=<type>:<name>` scope (opens a real tab for the subject) and the
  // `lens=lineage` hint (the middle pane shows the full lineage).
  const expandToWorkspace = useCallback(
    subject => {
      if (!subject) return;
      navigate(`/workspace?edit=${subject.type}:${subject.name}&lens=lineage`);
    },
    [navigate]
  );

  if (!dashboardConfig) return null;

  // A drag suppresses the affordance entirely (D-6 AC: disabled during drag) and
  // closes any open cards so a reflowing canvas can't orphan an anchor.
  const dragging = !!activeDrag;

  const root = rootRef.current;
  const boxFor = key =>
    root ? measure(root.querySelector(`[data-canvas-path="${key}"]`), root) : null;
  // `tick` is referenced so the lint dep-checker keeps boxFor results fresh on
  // reflow (boxFor reads the live DOM; the tick just forces this render).
  void tick;

  // The kebab renders for the hovered/selected item, every flipped item (so an
  // open card stays toggleable after the hover that opened it clears), AND the
  // item whose kebab/menu is being interacted with (menuHoverKey / openKey) so it
  // survives the cursor reach. Deduped.
  const menuKeys = [
    ...new Set([
      ...(activeKey ? [activeKey] : []),
      ...(menuHoverKey ? [menuHoverKey] : []),
      ...(openKey ? [openKey] : []),
      ...flipped,
    ]),
  ];

  // Resolve a subject + the slot box for each open (flipped) card. The card
  // overlays the slot IN PLACE (reading as the chart flipping over) rather than
  // anchoring beside it.
  const openCards = [...flipped]
    .map(key => {
      const item = itemAtKey(dashboardConfig, key);
      const subject = subjectForItem(item);
      const box = boxFor(key);
      return subject && box ? { key, subject, box } : null;
    })
    .filter(Boolean);

  return (
    // z-50 keeps the consolidated kebab (and any open flip card) ABOVE the sibling
    // canvas overlays — notably CanvasResizeLayer's pointer-events-auto resize
    // handles (z-30), which sit on the SELECTED item's corners exactly where the
    // kebab anchors (top-right). Without this the handles intercept the kebab
    // click on a selected slot. The layer stays pointer-events-none; only the
    // kebab/card opt back in.
    <div data-testid="canvas-flip-layer" className="pointer-events-none absolute inset-0 z-50">
      {/* Consolidated kebab on the hovered/selected leaf + every flipped item
          (hidden during drag). Copy link + Flip to lineage live in ONE menu —
          the SAME <ItemActionMenu> View mode uses. */}
      {!dragging &&
        menuKeys.map(key => {
          const subject = subjectForItem(itemAtKey(dashboardConfig, key));
          if (!subject) return null;
          const isFlipped = flipped.has(key);
          const actions = [
            {
              id: 'copy',
              label: 'Copy link',
              icon: PiLink,
              onSelect: copyItemLink,
            },
            {
              id: 'flip',
              label: isFlipped ? 'Hide lineage' : 'Flip to lineage',
              icon: PiArrowsClockwise,
              active: isFlipped,
              onSelect: () => toggleFlip(key),
            },
          ];
          return (
            <ItemActionMenu
              key={key}
              itemKey={key}
              box={boxFor(key)}
              reducedMotion={reducedMotion}
              actions={actions}
              open={openKey === key}
              onToggle={() => setOpenKey(prev => (prev === key ? null : key))}
              onClose={() => setOpenKey(prev => (prev === key ? null : prev))}
              onHover={isHovering =>
                setMenuHoverKey(prev => (isHovering ? key : prev === key ? null : prev))
              }
            />
          );
        })}

      {/* Open lineage cards (multi-flip). Each flips IN PLACE over its slot via
          the shared <ItemFlipCard> (which renders the shared <MiniLineageCard>),
          with the canvas surface tag. Suppressed during a drag. */}
      {!dragging &&
        openCards.map(card => (
          <ItemFlipCard
            key={card.key}
            box={card.box}
            obj={card.subject}
            reducedMotion={reducedMotion}
            onClose={() => toggleFlip(card.key)}
            onExpand={() => expandToWorkspace(card.subject)}
            testIdPrefix={`canvas-flip-card-${card.key}`}
          />
        ))}
    </div>
  );
};

export default CanvasItemFlipLayer;
