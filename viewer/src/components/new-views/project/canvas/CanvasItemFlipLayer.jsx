import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PiArrowsClockwise } from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { useWorkspaceDrag } from '../../workspace/WorkspaceDndContext';
import { emitWorkspaceEvent } from '../../workspace/telemetry';
import { parseRefValue } from '../../../../utils/refString';
import { parseCanvasPath } from './canvasReorder';
import ItemFlipCard from '../../../project/ItemFlipCard';

/**
 * CanvasItemFlipLayer — VIS-785 / Track D D-6 (flip-to-lineage).
 *
 * Per-item flip-to-lineage affordance for the Workspace dashboard canvas. A
 * SIBLING over the render-only <Dashboard> (mounted by ProjectCanvas alongside
 * the selection / DnD / resize / keyboard overlays). For the hovered-or-selected
 * leaf item it paints a small mulberry FLIP button in the item's top-right
 * corner; clicking it "flips" the slot to its lineage neighbourhood card.
 *
 * ### True in-place flip (<ItemFlipCard>)
 *
 * Clicking the flip toggle flips the slot IN PLACE: `<ItemFlipCard>` overlays
 * the slot's OWN box (a CSS-3D rotateY reveal) and renders the shared
 * `<MiniLineageCard>` (the branching ancestors/subject/descendants ladder with
 * the live selector input + Expand-to-lens footer). The card covers the chart
 * it came from rather than floating beside it.
 *
 * ### Behaviour (D-6 AC)
 *   - Click the flip icon → the item's lineage card flips in place over the slot.
 *   - The card shows ancestors + subject + descendants and a live selector input
 *     (defaulted to `+<name>+`); editing it re-walks the lineage.
 *   - Expand → routes the subject to the Workspace lineage lens (E-1).
 *   - Multi-flip: several items can be flipped at once (a Set of flipped keys).
 *   - Disabled during a drag (`useWorkspaceDrag`).
 *   - `prefers-reduced-motion`: the flip-button + card rotation animations are
 *     suppressed (the card degrades to a fade, honored by the OS setting).
 *
 * Mulberry (`#713b57`) is the affordance colour; the lineage card's per-type
 * colours come from objectTypeConfigs via MiniLineageCard.
 */

const MULBERRY = '#713b57';

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

// Anchor button for one item — paints the flip toggle in the slot's top-right.
const FlipButton = ({ box, flipped, onToggle, reducedMotion, anchorRef, itemKey }) => {
  if (!box) return null;
  return (
    <button
      ref={anchorRef}
      type="button"
      data-testid={`canvas-flip-button-${itemKey}`}
      data-flip-button="true"
      data-flipped={flipped ? 'true' : 'false'}
      aria-pressed={flipped}
      aria-label={flipped ? 'Hide lineage' : 'Show lineage'}
      title={flipped ? 'Hide lineage' : 'Flip to lineage'}
      // Swallow pointerdown/mousedown so the flip toggle stays a single,
      // authoritative click and never reaches the canvas selection / DnD layers
      // underneath (which would otherwise start a drag or re-select the slot).
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={onToggle}
      className={[
        'pointer-events-auto absolute z-50 inline-flex h-6 w-6 items-center justify-center rounded-md border bg-white/95 shadow-sm',
        reducedMotion ? '' : 'transition-transform duration-200',
      ].join(' ')}
      style={{
        top: box.top + 4,
        left: box.left + box.width - 28,
        borderColor: '#c6b0bb',
        color: MULBERRY,
        transform: flipped && !reducedMotion ? 'rotateY(180deg)' : 'none',
      }}
    >
      <PiArrowsClockwise className="h-3.5 w-3.5" />
    </button>
  );
};

const CanvasItemFlipLayer = ({ rootRef, dashboardName }) => {
  const dashboards = useStore(s => s.dashboards);
  const hoverKey = useStore(s => s.workspaceCanvasHoverKey);
  const selectedKey = useStore(s => s.workspaceOutlineSelectedKey);
  const activeDrag = useWorkspaceDrag();

  // Flipped item keys (multi-flip, Q3b) → each has an open lineage popover.
  const [flipped, setFlipped] = useState(() => new Set());
  // Measured box of the item the flip BUTTON should attach to (hover/selection).
  const [buttonBox, setButtonBox] = useState(null);
  const anchorRef = useRef(null);
  const reducedMotion = prefersReducedMotion();

  const dashboardConfig = useMemo(() => {
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    return entry.config || entry;
  }, [dashboards, dashboardName]);

  // The item the flip button attaches to: the hovered item, else the selected
  // item (only leaf items with a resolvable subject).
  const activeKey = useMemo(() => {
    const candidate = hoverKey && hoverKey.includes('.item.') ? hoverKey : selectedKey;
    if (!candidate || !candidate.includes('.item.')) return null;
    const item = itemAtKey(dashboardConfig, candidate);
    return subjectForItem(item) ? candidate : null;
  }, [hoverKey, selectedKey, dashboardConfig]);

  const measureButton = useCallback(() => {
    const root = rootRef.current;
    if (!root || !activeKey) {
      setButtonBox(null);
      return;
    }
    const el = root.querySelector(`[data-canvas-path="${activeKey}"]`);
    setButtonBox(el ? measure(el, root) : null);
  }, [rootRef, activeKey]);

  useEffect(() => {
    measureButton();
  }, [measureButton]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measureButton) : null;
    if (ro) ro.observe(root);
    window.addEventListener('resize', measureButton);
    window.addEventListener('scroll', measureButton, true);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measureButton);
      window.removeEventListener('scroll', measureButton, true);
    };
  }, [rootRef, measureButton]);

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

  if (!dashboardConfig) return null;

  // A drag suppresses the flip affordance entirely (D-6 AC: disabled during drag)
  // and closes any open cards so a reflowing canvas can't orphan an anchor.
  const dragging = !!activeDrag;

  const root = rootRef.current;
  const boxFor = key => (root ? measure(root.querySelector(`[data-canvas-path="${key}"]`), root) : null);

  // Flip buttons render for the hovered/selected item AND for every flipped item
  // (so an open card stays toggleable even after the hover that opened it clears
  // on the popover-mount reflow). Deduped.
  const buttonKeys = [...new Set([...(activeKey ? [activeKey] : []), ...flipped])];

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
    <div data-testid="canvas-flip-layer" className="pointer-events-none absolute inset-0 z-20">
      {/* Flip toggles on the hovered/selected leaf + every flipped item (hidden
          during drag). The active item uses the kept-fresh measured box; the
          others measure on render (they reflow rarely). */}
      {!dragging &&
        buttonKeys.map(key => {
          const subject = subjectForItem(itemAtKey(dashboardConfig, key));
          if (!subject) return null;
          const box = key === activeKey ? buttonBox || boxFor(key) : boxFor(key);
          return (
            <FlipButton
              key={key}
              itemKey={key}
              box={box}
              flipped={flipped.has(key)}
              reducedMotion={reducedMotion}
              anchorRef={key === activeKey ? anchorRef : undefined}
              onToggle={() => toggleFlip(key)}
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
            testIdPrefix={`canvas-flip-card-${card.key}`}
          />
        ))}
    </div>
  );
};

export default CanvasItemFlipLayer;
