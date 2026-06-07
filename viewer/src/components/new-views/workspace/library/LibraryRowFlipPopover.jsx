import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MiniLineageCard, {
  buildChainFromStore,
  buildLineageRelations,
  parseSelector,
  defaultSelector,
  ROW_HEIGHT,
  ROW_GAP,
  ROW_WIDTH,
  BASE_INDENT,
  CARD_WIDTH,
  UNBOUNDED,
} from './MiniLineageCard';

/**
 * LibraryRowFlipPopover — VIS-776 / Track C C3 (refined design).
 *
 * Anchored popover that flips out from a Library row (or, via
 * <CanvasItemFlipLayer>, a canvas slot) to show the row's full lineage
 * neighbourhood.
 *
 * ### VIS-780 / C-4 — shared `<MiniLineageCard>`
 *
 * The lineage-ladder body (selector input + ancestors/subject/descendants
 * staircase + SVG connectors + Expand footer) lived inline here. It has been
 * EXTRACTED into the shared `<MiniLineageCard>` so this component is now a thin
 * anchoring/portal wrapper: it owns positioning next to the anchor element,
 * the portal to `document.body`, and close-on-Escape / close-on-outside-click —
 * and delegates ALL lineage rendering to the one shared card. Both the Library
 * row flip and the canvas item flip render the identical card body. One source
 * of truth.
 *
 * The walker helpers (`buildLineageRelations`, `parseSelector`,
 * `defaultSelector`, …) are re-exported from `MiniLineageCard` for back-compat
 * with existing importers.
 */

// ---------------------------------------------------------------------------
// Anchoring
// ---------------------------------------------------------------------------

const FALLBACK_POSITION = { top: 100, left: 100 };

const computeAnchoredPosition = anchorEl => {
  if (!anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') {
    return FALLBACK_POSITION;
  }
  const rect = anchorEl.getBoundingClientRect();
  return {
    top: rect.top + rect.height / 2,
    left: rect.right + 12,
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LibraryRowFlipPopover = ({
  obj,
  anchorRef,
  onClose,
  // Optional Expand override forwarded to <MiniLineageCard>. Default (omitted)
  // routes Expand to the Workspace lineage lens; View mode (VIS-788) overrides
  // it to deep-link to /workspace?edit=<type>:<name> (no right rail in View).
  onExpand,
  testIdPrefix = 'library-flip-popover',
}) => {
  const popoverRef = useRef(null);

  const [position, setPosition] = useState(() =>
    computeAnchoredPosition(anchorRef?.current)
  );

  useEffect(() => {
    if (!anchorRef?.current) return undefined;
    const update = () => setPosition(computeAnchoredPosition(anchorRef.current));
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose && onClose();
    };
    const onDoc = e => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose && onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClose]);

  if (!obj) return null;

  return createPortal(
    <div
      ref={popoverRef}
      data-testid={testIdPrefix}
      role="dialog"
      aria-label={`Lineage preview for ${obj.name}`}
      className="fixed z-50"
      style={{
        top: position.top,
        left: position.left,
        width: CARD_WIDTH,
        transform: 'translateY(-50%)',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 rounded-sm bg-white ring-1 ring-gray-200"
      />
      <MiniLineageCard obj={obj} onClose={onClose} onExpand={onExpand} testIdPrefix={testIdPrefix} />
    </div>,
    document.body
  );
};

export {
  buildChainFromStore,
  buildLineageRelations,
  parseSelector,
  defaultSelector,
  ROW_HEIGHT,
  ROW_GAP,
  ROW_WIDTH,
  BASE_INDENT,
  UNBOUNDED,
};
export default LibraryRowFlipPopover;
