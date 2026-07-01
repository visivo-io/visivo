import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PiX } from 'react-icons/pi';
import MiniLineageCard from '../views/workspace/library/MiniLineageCard';

/**
 * ItemFlipCard — true in-place flip-to-lineage card.
 *
 * Replaces the old `<LibraryRowFlipPopover>` anchoring for the canvas + view
 * IN-SLOT flips. Instead of a portaled popover floating BESIDE the slot (which
 * landed over neighbouring charts), this card overlays the chart's OWN slot —
 * it reads as the chart flipping over to reveal its lineage on the back.
 *
 * ### Positioning
 *
 * Rendered absolutely-positioned inside the flip-layer root (which is
 * `absolute inset-0` over the render-only <Dashboard>), at the slot `box`
 * (`{ top, left, width, height }` already measured relative to that root). The
 * card fills the slot but enforces a sensible minimum size so even a small slot
 * still yields a usable lineage surface — growing from the slot's top-left and
 * clamped to the viewport.
 *
 * ### Animation
 *
 * A real CSS 3D flip: the container rotates `rotateY(180deg)` on a perspective
 * parent so the lineage back-face is revealed where the chart front-face was.
 * Under `reducedMotion` this degrades to a fade/scale (no rotation).
 *
 * The lineage body is the shared `<MiniLineageCard>` (selector input +
 * ancestors/subject/descendants ladder + Expand footer) so this surface stays
 * identical to every other lineage card in the app.
 */

// Minimum usable card footprint. A wide chart's slot is bigger than this, so the
// card just fills the slot; a small slot grows the card to at least these dims.
const MIN_WIDTH = 300;
const MIN_HEIGHT = 220;
const VIEWPORT_MARGIN = 12;

const ItemFlipCard = ({ box, obj, onClose, onExpand, reducedMotion = false, testIdPrefix }) => {
  const containerRef = useRef(null);
  const [revealed, setRevealed] = useState(reducedMotion);

  // Kick the flip animation on mount (a tick after paint) so the transition runs
  // from the chart face to the lineage back. Reduced motion skips straight to
  // revealed (no rotation, just a fade-in handled by opacity).
  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return undefined;
    }
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [reducedMotion]);

  // Size + position: fill the slot, clamped to the minimums, then clamped to the
  // viewport so the lineage ladder stays on-screen and scrollable. The card
  // grows from the slot's top-left corner.
  const geometry = useMemo(() => {
    if (!box) return null;
    const viewportW = typeof window !== 'undefined' ? window.innerWidth : MIN_WIDTH;
    const viewportH = typeof window !== 'undefined' ? window.innerHeight : MIN_HEIGHT;
    const maxW = Math.max(MIN_WIDTH, viewportW - 2 * VIEWPORT_MARGIN);
    const maxH = Math.max(MIN_HEIGHT, viewportH - 2 * VIEWPORT_MARGIN);
    const width = Math.min(maxW, Math.max(MIN_WIDTH, box.width || 0));
    const height = Math.min(maxH, Math.max(MIN_HEIGHT, box.height || 0));
    return {
      top: box.top,
      left: box.left,
      width,
      height,
    };
  }, [box]);

  if (!obj || !geometry) return null;

  return (
    <div
      ref={containerRef}
      data-testid={testIdPrefix}
      role="dialog"
      aria-label={`Lineage preview for ${obj.name}`}
      className="pointer-events-auto absolute z-40"
      style={{
        top: geometry.top,
        left: geometry.left,
        width: geometry.width,
        height: geometry.height,
        perspective: reducedMotion ? undefined : 900,
      }}
    >
      <div
        data-testid={`${testIdPrefix}-face`}
        className="relative h-full w-full"
        style={{
          transformStyle: reducedMotion ? undefined : 'preserve-3d',
          transition: reducedMotion ? 'opacity 150ms ease-out' : 'transform 350ms ease',
          transform: reducedMotion
            ? undefined
            : `rotateY(${revealed ? 0 : 180}deg)`,
          opacity: revealed ? 1 : reducedMotion ? 0 : 1,
        }}
      >
        <div
          className="absolute inset-0 flex flex-col overflow-auto rounded-lg bg-white shadow-xl ring-1 ring-gray-200"
          style={{ backfaceVisibility: reducedMotion ? undefined : 'hidden' }}
        >
          {/* Own close affordance in the top-right so the flip-back is always
              reachable even if the embedded card's header scrolls away. */}
          <button
            type="button"
            onClick={onClose}
            title="Flip back"
            aria-label="Flip back to chart"
            data-testid={`${testIdPrefix}-flip-back`}
            className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white/95 text-gray-400 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <PiX className="h-3.5 w-3.5" />
          </button>
          <MiniLineageCard
            obj={obj}
            onClose={onClose}
            onExpand={onExpand}
            testIdPrefix={testIdPrefix}
          />
        </div>
      </div>
    </div>
  );
};

export { MIN_WIDTH, MIN_HEIGHT };
export default ItemFlipCard;
