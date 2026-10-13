import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PiArrowRight, PiPencilSimple } from 'react-icons/pi';
import { getTypeColors, getTypeIcon } from '../common/objectTypeConfigs';

/**
 * RenameImpactDialog — what a rename will change, before it changes it.
 *
 * A rename is not a local edit. Every `${ref(old)}` in the project is rewritten
 * with it, and each rewrite makes a published object uncommitted. Confirming it
 * blind means agreeing to edits across objects you may not have open.
 *
 * The list comes from the server's impact query, which walks the same traversal
 * the rename applies (`rename_service.rename_impact`, core's `rename_impact`),
 * so it cannot promise something the rename then does differently.
 *
 * Props:
 *   impact    {target, references} | null — null while loading
 *   error     string | null — a rejection, e.g. a 409 name collision
 *   loading   boolean
 *   onConfirm / onCancel
 */

const SINGULAR = {
  sources: 'source',
  models: 'model',
  metrics: 'metric',
  dimensions: 'dimension',
  relations: 'relation',
  insights: 'insight',
  charts: 'chart',
  tables: 'table',
  markdowns: 'markdown',
  inputs: 'input',
  dashboards: 'dashboard',
};

const typeOf = plural => SINGULAR[plural] || plural;

function ReferenceRow({ reference }) {
  const type = typeOf(reference.type);
  const Icon = getTypeIcon(type);
  const { bg, text } = getTypeColors(type);
  return (
    <li
      data-testid={`rename-impact-reference-${reference.name}`}
      className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-gray-800"
    >
      <span
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ${bg} ${text}`}
      >
        {Icon && <Icon style={{ fontSize: 11 }} />}
      </span>
      <span className="truncate font-medium">{reference.name}</span>
      <span className="ml-auto shrink-0 text-[11px] text-gray-400">
        {reference.status === 'published' ? 'becomes uncommitted' : reference.status}
      </span>
    </li>
  );
}

const RenameImpactDialog = ({ impact, error, loading, onConfirm, onCancel }) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (cancelRef.current) cancelRef.current.focus();
    const onKey = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel && onCancel();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const target = impact?.target;
  const references = impact?.references || [];
  // Every listed object is rewritten; `published` ones are the ones this rename
  // turns dirty, which is the part the user is being asked to accept.
  const newlyDirty = references.filter(r => r.status === 'published').length;

  return createPortal(
    <div
      data-testid="rename-impact-backdrop"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30"
      onPointerDown={e => {
        if (e.target === e.currentTarget) onCancel && onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rename-impact-title"
        data-testid="rename-impact-dialog"
        className="w-[460px] max-w-[calc(100vw-32px)] rounded-lg bg-white p-5 shadow-xl ring-1 ring-gray-200"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary">
            <PiPencilSimple style={{ fontSize: 20 }} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="rename-impact-title" className="text-[15px] font-semibold text-gray-900">
              Rename this {target ? typeOf(target.type) : 'object'}?
            </h2>

            {target && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-gray-700">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">{target.name}</code>
                <PiArrowRight className="shrink-0 text-gray-400" style={{ fontSize: 12 }} />
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                  {target.new_name}
                </code>
              </div>
            )}

            {loading && (
              <p data-testid="rename-impact-loading" className="mt-3 text-[12.5px] text-gray-500">
                Checking what this affects…
              </p>
            )}

            {error && (
              <p
                data-testid="rename-impact-error"
                className="mt-3 text-[12.5px] font-medium text-highlight-600"
              >
                {error}
              </p>
            )}

            {!loading && !error && impact && (
              <div className="mt-3">
                {references.length === 0 ? (
                  <p data-testid="rename-impact-empty" className="text-[12.5px] text-gray-500">
                    Nothing else references it, so only this object changes.
                  </p>
                ) : (
                  <>
                    <p className="text-[12.5px] text-gray-600">
                      {references.length === 1
                        ? '1 other object references it'
                        : `${references.length} other objects reference it`}{' '}
                      and will be updated
                      {newlyDirty > 0 && (
                        <>
                          {' '}
                          — <strong>{newlyDirty}</strong>{' '}
                          {newlyDirty === 1 ? 'of them is' : 'of them are'} currently published, so{' '}
                          {newlyDirty === 1 ? 'it becomes an uncommitted change' : 'they become uncommitted changes'}
                        </>
                      )}
                      .
                    </p>
                    <ul
                      data-testid="rename-impact-references"
                      className="mt-2 max-h-52 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100"
                    >
                      {references.map(reference => (
                        <ReferenceRow
                          key={`${reference.type}:${reference.name}`}
                          reference={reference}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-testid="rename-impact-cancel"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="rename-impact-confirm"
            onClick={onConfirm}
            disabled={loading || !!error || !impact}
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Rename
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RenameImpactDialog;
