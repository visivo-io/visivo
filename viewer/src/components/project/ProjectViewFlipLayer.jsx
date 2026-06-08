import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PiArrowsClockwise, PiLink } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { parseRefValue } from '../../utils/refString';
import { parseCanvasPath } from '../new-views/project/canvas/canvasReorder';
import ItemFlipCard from './ItemFlipCard';
import ItemActionMenu from './ItemActionMenu';
import copy from 'copy-to-clipboard';

// Replicate the items' built-in "Copy link" behavior: copy the current URL with
// `element_id` set to the scroll offset so the link reopens at this slot.
const copyItemLink = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('element_id', window.scrollY);
  copy(url.toString());
};

/**
 * ProjectViewFlipLayer — VIS-788 / I-1 (View-mode flip gesture).
 *
 * Per Q3b the flip-to-lineage gesture lives in VIEW mode too — not just the
 * Workspace build canvas. This mounts a SIBLING over the render-only
 * <Dashboard> at `/project/<name>` and paints a kebab (⋮) menu in the top-right
 * of each hovered leaf slot (chart/table/markdown/input). Selecting "Flip to
 * lineage" flips the slot IN PLACE to its lineage neighbourhood card —
 * `<ItemFlipCard>` overlays the slot's OWN box (reading as the chart flipping
 * over) and renders the shared <MiniLineageCard> extracted by VIS-780.
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

const ProjectViewFlipLayer = ({ rootRef, dashboardConfig }) => {
  const navigate = useNavigate();
  const reducedMotion = prefersReducedMotion();
  const [hoverKey, setHoverKey] = useState(null);
  // The kebab lives in a sibling overlay, so reaching for it clears the slot
  // hover. These two keep a menu mounted while its kebab is hovered (menuHoverKey)
  // or its dropdown is open (openKey) — independent of the transient slot hover.
  const [menuHoverKey, setMenuHoverKey] = useState(null);
  const [openKey, setOpenKey] = useState(null);
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

  // The kebab menu renders for the hovered leaf, the slot whose kebab/menu is
  // being interacted with (menuHoverKey / openKey), AND every flipped item (so an
  // open card stays toggleable after the hover that opened it clears). Deduped.
  const menuKeys = useMemo(
    () => [
      ...new Set([
        ...(hoverKey ? [hoverKey] : []),
        ...(menuHoverKey ? [menuHoverKey] : []),
        ...(openKey ? [openKey] : []),
        ...flipped,
      ]),
    ],
    [hoverKey, menuHoverKey, openKey, flipped]
  );

  // Resolve a subject + the slot box for each open (flipped) card. The card
  // overlays the slot IN PLACE, so it positions at the slot box (re-measured on
  // reflow via `tick`) rather than anchoring beside it.
  const openCards = useMemo(
    () =>
      [...flipped]
        .map(key => {
          const subject = subjectForItem(itemAtKey(dashboardConfig, key));
          const box = boxFor(key);
          return subject && box ? { key, subject, box } : null;
        })
        .filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flipped, dashboardConfig, boxFor, tick]
  );

  if (!dashboardConfig) return null;

  return (
    <div data-testid="view-flip-layer" className="pointer-events-none absolute inset-0 z-50">
      {menuKeys.map(key => {
        const subject = subjectForItem(itemAtKey(dashboardConfig, key));
        if (!subject) return null;
        const isFlipped = flipped.has(key);
        // EXTENSIBLE action list — adding a future View-mode item action is a
        // one-line addition here. v1: Copy link + Flip to lineage.
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

      {openCards.map(card => (
        <ItemFlipCard
          key={card.key}
          box={card.box}
          obj={card.subject}
          reducedMotion={reducedMotion}
          onClose={() => toggleFlip(card.key)}
          onExpand={() => expandToWorkspace(card.subject)}
          testIdPrefix={`view-flip-card-${card.key}`}
        />
      ))}
    </div>
  );
};

export default ProjectViewFlipLayer;
