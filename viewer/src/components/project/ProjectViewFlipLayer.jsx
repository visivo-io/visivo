import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PiArrowsClockwise } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { parseRefValue } from '../../utils/refString';
import { parseCanvasPath } from '../new-views/project/canvas/canvasReorder';
import LibraryRowFlipPopover from '../new-views/workspace/library/LibraryRowFlipPopover';

/**
 * ProjectViewFlipLayer — VIS-788 / I-1 (View-mode flip gesture).
 *
 * Per Q3b the flip-to-lineage gesture lives in VIEW mode too — not just the
 * Workspace build canvas. This mounts a SIBLING over the render-only
 * <Dashboard> at `/project/<name>` and paints a small mulberry FLIP button in
 * the top-right of each hovered leaf slot (chart/table/markdown/input).
 * Clicking it flips the slot to its lineage neighbourhood card — the SAME
 * delivered surface the build canvas uses (<LibraryRowFlipPopover>, which
 * renders the shared <MiniLineageCard> extracted by VIS-780). No new design.
 *
 * ### View-mode specifics
 *
 *   - View mode has NO right rail and NO Workspace selection store. This layer
 *     therefore owns its OWN hover state via pointer delegation on the root
 *     (rather than reading `workspaceCanvasHoverKey`), and has no drag to
 *     suppress against.
 *   - A card-node "Expand" deep-links to `/workspace?edit=<type>:<name>` (the
 *     canonical editor-redirect target) instead of flipping a right-rail lens —
 *     because View mode can't open a rail in place.
 *
 * Mulberry (`#713b57`) is the affordance colour; per-type colours come from
 * objectTypeConfigs via the shared card.
 */

const MULBERRY = '#713b57';

// Honor the user's reduced-motion preference: suppress the flip-button rotation +
// transition when `prefers-reduced-motion: reduce` is set. Mirrors the canvas
// flip layer (CanvasItemFlipLayer) so both flip surfaces behave identically.
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const measure = (el, rootEl) => {
  if (!el || !rootEl) return null;
  const node = el.getBoundingClientRect();
  const root = rootEl.getBoundingClientRect();
  return {
    top: node.top - root.top,
    left: node.left - root.left,
    width: node.width,
    height: node.height,
  };
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

const FlipButton = ({ box, flipped, onToggle, itemKey, reducedMotion }) => {
  if (!box) return null;
  return (
    <button
      type="button"
      data-testid={`view-flip-button-${itemKey}`}
      data-flip-button="true"
      data-flipped={flipped ? 'true' : 'false'}
      aria-pressed={flipped}
      aria-label={flipped ? 'Hide lineage' : 'Show lineage'}
      title={flipped ? 'Hide lineage' : 'Flip to lineage'}
      // Swallow the pointerdown so the open card's outside-mousedown-close
      // doesn't fight the button's own toggle (matches CanvasItemFlipLayer).
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={onToggle}
      className={[
        'pointer-events-auto absolute z-30 inline-flex h-6 w-6 items-center justify-center rounded-md border bg-white/95 shadow-sm',
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

const ProjectViewFlipLayer = ({ rootRef, dashboardConfig }) => {
  const navigate = useNavigate();
  const reducedMotion = prefersReducedMotion();
  const [hoverKey, setHoverKey] = useState(null);
  const [flipped, setFlipped] = useState(() => new Set());
  const [tick, setTick] = useState(0); // forces a re-measure on reflow

  // Hover tracking via pointer delegation on the render root (View mode has no
  // Workspace selection store). The innermost `data-canvas-path` under the
  // cursor that resolves to a flippable leaf becomes the active hover key.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onMove = e => {
      const el = e.target.closest('[data-canvas-path]');
      const key = el && root.contains(el) ? el.getAttribute('data-canvas-path') : null;
      if (key && key.includes('.item.') && subjectForItem(itemAtKey(dashboardConfig, key))) {
        setHoverKey(prev => (prev === key ? prev : key));
      } else {
        setHoverKey(null);
      }
    };
    const onLeave = () => setHoverKey(null);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    return () => {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    };
  }, [rootRef, dashboardConfig]);

  // Re-measure on resize/scroll so the flip button + open cards track reflow.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onReflow = () => setTick(t => t + 1);
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

  const toggleFlip = useCallback(key => {
    setFlipped(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Expand deep-links to the Workspace editor for the subject (View mode has no
  // rail to flip in place). Closes the flipped card afterwards.
  const expandToWorkspace = useCallback(
    subject => {
      if (!subject) return;
      navigate(`/workspace?edit=${subject.type}:${subject.name}`);
    },
    [navigate]
  );

  const root = rootRef.current;
  const boxFor = useCallback(
    key => (root ? measure(root.querySelector(`[data-canvas-path="${key}"]`), root) : null),
    [root]
  );

  // Flip buttons render for the hovered leaf AND every flipped item (so an open
  // card stays toggleable after the hover that opened it clears). Deduped.
  const buttonKeys = useMemo(
    () => [...new Set([...(hoverKey ? [hoverKey] : []), ...flipped])],
    [hoverKey, flipped]
  );

  // Resolve a stable anchor element + subject for each open (flipped) card.
  const openCards = useMemo(
    () =>
      [...flipped]
        .map(key => {
          const subject = subjectForItem(itemAtKey(dashboardConfig, key));
          const el = root ? root.querySelector(`[data-canvas-path="${key}"]`) : null;
          return subject && el ? { key, subject, el } : null;
        })
        .filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flipped, dashboardConfig, root, tick]
  );

  if (!dashboardConfig) return null;

  return (
    <div data-testid="view-flip-layer" className="pointer-events-none absolute inset-0 z-20">
      {buttonKeys.map(key => {
        const subject = subjectForItem(itemAtKey(dashboardConfig, key));
        if (!subject) return null;
        return (
          <FlipButton
            key={key}
            itemKey={key}
            box={boxFor(key)}
            flipped={flipped.has(key)}
            reducedMotion={reducedMotion}
            onToggle={() => toggleFlip(key)}
          />
        );
      })}

      {openCards.map(card => (
        <FlipCardAnchor
          key={card.key}
          cardKey={card.key}
          el={card.el}
          subject={card.subject}
          onClose={() => toggleFlip(card.key)}
          onExpand={expandToWorkspace}
        />
      ))}
    </div>
  );
};

/**
 * FlipCardAnchor — wraps LibraryRowFlipPopover with a ref anchored to the item's
 * live DOM node so the popover positions next to the View-mode slot. The popover
 * already portals to the body + tracks scroll/resize, and renders the shared
 * <MiniLineageCard>. `onExpand` overrides the default lens flip with the
 * View-mode deep link.
 */
const FlipCardAnchor = ({ cardKey, el, subject, onClose, onExpand }) => {
  const anchorRef = useRef(el);
  anchorRef.current = el;
  return (
    <LibraryRowFlipPopover
      obj={subject}
      anchorRef={anchorRef}
      onClose={onClose}
      onExpand={() => onExpand(subject)}
      testIdPrefix={`view-flip-card-${cardKey}`}
    />
  );
};

export default ProjectViewFlipLayer;
