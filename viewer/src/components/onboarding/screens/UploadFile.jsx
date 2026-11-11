import React, { useEffect, useRef, useState } from 'react';
import { importProjectFile, listProjectFiles, uploadProjectFile } from '../../../api/projectFiles';
import useStore from '../../../stores/store';

export const UPLOAD_ICON = <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />;

export function sourceNameFor(filename, taken = []) {
  const stem = filename.replace(/\.[^.]*$/, '');
  let base = stem
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base || /^[0-9]/.test(base)) base = `file_${base}`.replace(/_+$/, '');
  const names = new Set(taken);
  let name = base;
  for (let n = 2; names.has(name); n += 1) name = `${base}_${n}`;
  return name;
}

const megabytes = bytes => Math.round(bytes / 1024 / 1024);

const extensionOf = name => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
};

function Steps({ phase }) {
  const steps = [
    ['uploading', 'Copying the file into the project'],
    ['importing', 'Creating a source you can query'],
  ];
  const at = steps.findIndex(([key]) => key === phase);
  return (
    <ol className="onb-upload__steps">
      {steps.map(([key, label], i) => (
        <li key={key} className={i < at ? 'is-done' : i === at ? 'is-active' : ''}>
          <span aria-hidden="true">{i < at ? '✓' : '•'}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export default function UploadFile({ onBack, onImported }) {
  const projectId = useStore(s => s.project?.id ?? null);
  const fetchSources = useStore(s => s.fetchSources);
  const [formats, setFormats] = useState(null);
  const [maxBytes, setMaxBytes] = useState(null);
  const [phase, setPhase] = useState('choose');
  const [file, setFile] = useState(null);
  const [storedPath, setStoredPath] = useState(null);
  const [error, setError] = useState(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const run = useRef(0);
  const abort = useRef(null);

  useEffect(() => {
    let live = true;
    listProjectFiles({ projectId })
      .then(body => {
        if (!live) return;
        setFormats(body.formats || []);
        setMaxBytes(body.max_bytes ?? null);
      })
      .catch(err => live && setError(err.message));
    return () => {
      live = false;
      run.current += 1;
      abort.current?.abort();
    };
  }, [projectId]);

  const extensions = (formats || []).flatMap(f => f.extensions);
  const labels = (formats || []).map(f => f.label).join(', ');
  const busy = phase === 'uploading' || phase === 'importing';

  const fail = message => {
    setError(message);
    setPhase('error');
  };

  const start = async picked => {
    if (!picked || busy) return;
    if (!extensions.includes(extensionOf(picked.name))) {
      fail(`Visivo can't import ${picked.name} yet. Use a ${labels || 'supported'} file.`);
      return;
    }
    if (maxBytes != null && picked.size > maxBytes) {
      fail(`${picked.name} is larger than ${megabytes(maxBytes)} MB.`);
      return;
    }
    const id = ++run.current;
    abort.current = new AbortController();
    setFile(picked);
    setStoredPath(null);
    setError(null);
    setPhase('uploading');
    try {
      const version = await uploadProjectFile(picked, {
        projectId,
        signal: abort.current.signal,
      });
      if (id !== run.current) return;
      setStoredPath(version.path);
      setPhase('importing');
      await fetchSources?.();
      const taken = (useStore.getState().sources || []).map(s => s.name);
      const imported = await importProjectFile({
        path: version.path,
        versionId: version.version_id,
        sourceName: sourceNameFor(version.filename, taken),
        projectId,
      });
      if (id !== run.current) return;
      if (!imported.ok) throw new Error(imported.error);
      await fetchSources?.();
      if (id !== run.current) return;
      onImported(imported.result);
    } catch (err) {
      if (id !== run.current) return;
      fail(err.message || 'Could not add the file.');
    }
  };

  const cancel = () => {
    run.current += 1;
    abort.current?.abort();
    setPhase('choose');
    setError(null);
  };

  const onDrop = e => {
    e.preventDefault();
    setOver(false);
    start(e.dataTransfer?.files?.[0]);
  };

  if (busy) {
    return (
      <div className="onb-upload" data-testid="onb-upload-progress">
        <h3 className="onb-upload__h">Adding your file</h3>
        <div className="onb-upload__file">
          <strong>{file?.name}</strong>
          <small>{storedPath ? `Saved as ${storedPath}` : 'Copying into files/'}</small>
        </div>
        <div className="onb-upload__bar" role="progressbar" aria-label="Adding your file">
          <i />
        </div>
        <Steps phase={phase} />
        <button type="button" className="onb-text-link" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="onb-upload">
      <button
        type="button"
        className="onb-upload__back"
        onClick={onBack}
        data-testid="onb-upload-back"
      >
        ← Back
      </button>
      <h3 className="onb-upload__h">A file. A source. Ready to explore.</h3>
      <p className="onb-upload__sub">
        We&rsquo;ll copy your file into the project&rsquo;s <code>files/</code> folder and create a
        source automatically.
      </p>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={extensions.join(',')}
        onChange={e => start(e.target.files?.[0])}
        data-testid="onb-upload-input"
      />
      <button
        type="button"
        className={`onb-upload__drop ${over ? 'is-over' : ''}`}
        disabled={formats === null}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid="onb-upload-drop"
      >
        <span className="onb-door__icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {UPLOAD_ICON}
          </svg>
        </span>
        <span className="onb-upload__drop-title">Drop your data file here</span>
        <span className="onb-upload__drop-sub">or browse files on your computer</span>
        <span className="onb-upload__browse">Browse files</span>
      </button>
      {labels && (
        <p className="onb-upload__formats">
          {labels}
          {maxBytes != null && ` files up to ${megabytes(maxBytes)} MB`}
        </p>
      )}
      {error && (
        <div className="onb-upload__error" role="alert" data-testid="onb-upload-error">
          {error}
        </div>
      )}
      <p className="onb-upload__hint">An existing file is never overwritten.</p>
    </div>
  );
}
