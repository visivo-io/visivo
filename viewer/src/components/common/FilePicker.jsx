import React, { useEffect, useId, useRef, useState } from 'react';
import useStore from '../../stores/store';
import { listProjectFiles } from '../../api/projectFiles';
import useEscapeToClose from '../../hooks/useEscapeToClose';

const formatSize = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const describeError = err =>
  err?.code === 'not_implemented'
    ? 'Browsing project files is not available here yet. Type the path instead.'
    : err?.message || 'Could not list project files.';

/** Browse the project's files and pick one; `onSelect` gets its project-relative path. */
const FilePicker = ({ extensions = [], onSelect, label = 'file', testId = 'file-picker' }) => {
  const projectId = useStore(state => state.project?.id);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ status: 'idle', files: [], error: null });
  const triggerRef = useRef(null);
  const rootRef = useRef(null);
  const listId = useId();
  const extensionKey = extensions.join(',');

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  useEscapeToClose(open, close);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState(prev => ({ ...prev, status: 'loading', error: null }));
    listProjectFiles({ extensions: extensionKey ? extensionKey.split(',') : [], projectId })
      .then(body => !cancelled && setState({ status: 'ready', files: body.files, error: null }))
      .catch(err => !cancelled && setState({ status: 'error', files: [], error: err }));
    return () => {
      cancelled = true;
    };
  }, [open, extensionKey, projectId]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const choose = path => {
    onSelect(path);
    close();
  };

  const extensionText = extensions.map(ext => `.${ext}`).join(', ');

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label="Browse project files"
        className="px-2 py-1 text-xs font-medium text-primary-600 rounded hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
        data-testid={`${testId}-browse`}
      >
        Browse
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white shadow-lg"
          data-testid={`${testId}-panel`}
        >
          {state.status === 'loading' && (
            <p className="px-3 py-2 text-sm text-gray-500" role="status">
              Loading files…
            </p>
          )}
          {state.status === 'error' && (
            <p className="px-3 py-2 text-sm text-red-600" role="alert">
              {describeError(state.error)}
            </p>
          )}
          {state.status === 'ready' && state.files.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">
              No {extensionText || ''} files in this project yet.
            </p>
          )}
          {state.status === 'ready' && state.files.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              aria-label={`Project files for ${label}`}
              className="max-h-64 overflow-y-auto py-1"
            >
              {state.files.map(file => (
                <li key={file.path} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => choose(file.path)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                    data-testid={`${testId}-option`}
                  >
                    <span className="truncate font-mono text-gray-900">{file.path}</span>
                    <span className="shrink-0 text-xs text-gray-500">{formatSize(file.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default FilePicker;
