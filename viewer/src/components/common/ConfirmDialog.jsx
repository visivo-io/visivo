import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalOverlay, ModalWrapper } from '../styled/Modal';

/**
 * ConfirmDialog + useConfirm — the brand replacement for `window.confirm()`.
 *
 * `window.confirm` renders raw, off-brand OS chrome that is invisible on screen
 * shares. This is a brand modal (reusing the `styled/Modal` shell) driven by an
 * imperative `useConfirm()` hook so the call site stays a one-liner:
 *
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   const ok = await confirm({
 *     title: 'Reset the layout?',
 *     body: 'This clears your moved cards and edges.',
 *     confirmLabel: 'Reset',
 *     danger: true,
 *   });
 *   // ...render {ConfirmDialog} somewhere in the component's JSX.
 *
 * Danger actions use `bg-highlight hover:bg-highlight-700` per the design system.
 */

const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}) => {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const onKey = e => {
      if (e.key === 'Escape') onCancel?.();
      else if (e.key === 'Enter') onConfirm?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const confirmClasses = danger
    ? 'bg-highlight hover:bg-highlight-700 focus:ring-highlight-300'
    : 'bg-primary-500 hover:bg-primary-600 focus:ring-primary-300';

  return createPortal(
    <ModalOverlay
      data-testid={testId}
      onClick={e => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <ModalWrapper
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="!max-w-md !p-6"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <h2 data-testid={`${testId}-title`} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
        )}
        {body && <p className="mt-2 text-sm text-gray-600">{body}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            data-testid={`${testId}-cancel`}
            onClick={() => onCancel?.()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-200"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            data-testid={`${testId}-confirm`}
            onClick={() => onConfirm?.()}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-4 ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </ModalWrapper>
    </ModalOverlay>,
    document.body
  );
};

/**
 * useConfirm — imperative confirm() returning Promise<boolean>, plus the
 * `ConfirmDialog` element to render in the component tree.
 */
export function useConfirm(defaults = {}) {
  const [state, setState] = useState({ open: false, options: {} });
  const resolverRef = useRef(null);

  const confirm = useCallback(
    (options = {}) =>
      new Promise(resolve => {
        resolverRef.current = resolve;
        setState({ open: true, options: { ...defaults, ...options } });
      }),
    // defaults is typically a stable inline literal; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const close = useCallback(result => {
    setState(prev => ({ ...prev, open: false }));
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.options.title}
      body={state.options.body}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      danger={state.options.danger}
      testId={state.options.testId}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { confirm, ConfirmDialog: dialog };
}

export default ConfirmDialog;
