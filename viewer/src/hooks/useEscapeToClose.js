import { useEffect, useRef } from 'react';

/**
 * Close the topmost open layer (modal, menu, popover, drawer) on Escape.
 *
 * Every open layer joins one stack, in the order it opened. One document
 * listener calls only the top layer's latest `onClose(event)` and marks the
 * event handled, so nested layers close one per keypress. An element that
 * gives Escape its own meaning calls `event.preventDefault()` and the layer
 * stays open.
 */
const stack = [];

const onKeyDown = event => {
  if (event.key !== 'Escape' || event.defaultPrevented || stack.length === 0) return;
  event.preventDefault();
  stack[stack.length - 1].current?.(event);
};

const push = layer => {
  if (stack.length === 0) document.addEventListener('keydown', onKeyDown);
  stack.push(layer);
};

const remove = layer => {
  const index = stack.indexOf(layer);
  if (index !== -1) stack.splice(index, 1);
  if (stack.length === 0) document.removeEventListener('keydown', onKeyDown);
};

export const hasOpenEscapeLayer = () => stack.length > 0;

export default function useEscapeToClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    push(onCloseRef);
    return () => remove(onCloseRef);
  }, [open]);
}
