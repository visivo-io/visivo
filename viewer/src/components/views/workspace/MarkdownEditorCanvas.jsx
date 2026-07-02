import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../../stores/store';
import Markdown from '../../items/Markdown';
import { getTypeColors } from '../common/objectTypeConfigs';
import { useObjectCanvasDirty } from './ObjectCanvasFrame';
import useDebouncedSave from './useDebouncedSave';

/**
 * MarkdownEditorCanvas — VIS-1010.
 *
 * The editable `edit` lens of the markdown object canvas. A clean split surface:
 * a plain-text markdown editor on the LEFT, a LIVE rendered preview on the RIGHT
 * (reusing the same <Markdown> renderer the Dashboard mounts for a markdown
 * item, so what you type is exactly what ships).
 *
 * Behaviour:
 *   - owns a LOCAL draft of the record's markdown content (align / justify are
 *     preserved from the saved record so a content edit never drops them);
 *   - debounce-saves the draft (~600ms) through the markdown store's
 *     `saveMarkdown(name, config)` action;
 *   - drives the frame's dirty state via `useObjectCanvasDirty().setDirty` —
 *     dirty === the draft differs from the last SAVED content.
 *
 * Editing is deliberately a split editor/preview (not a full block editor): a
 * tasteful Notion-style canvas without re-implementing a WYSIWYG engine.
 */

const SAVE_DELAY_MS = 600;

const MarkdownEditorCanvas = ({ activeObject, record }) => {
  const name = activeObject?.name || record?.name || null;
  const colors = getTypeColors('markdown');

  // The live markdown collection is the source of truth for the SAVED content
  // (the store refreshes it after every save). We seed the draft from it / the
  // frame-resolved record and re-seed when the selected object changes.
  const markdowns = useStore(s => s.markdowns);
  const saveMarkdown = useStore(s => s.saveMarkdown);

  const savedRecord = useMemo(() => {
    const fromStore = Array.isArray(markdowns)
      ? markdowns.find(m => m.name === name)
      : null;
    if (fromStore) {
      const cfg = fromStore.config || fromStore;
      return { name: fromStore.name, content: cfg.content || '', ...cfg };
    }
    if (record && record.name === name) {
      return { name, content: record.content || '', ...record };
    }
    return null;
  }, [markdowns, record, name]);

  const savedContent = savedRecord?.content || '';
  const align = savedRecord?.align ?? record?.align ?? 'left';
  const justify = savedRecord?.justify ?? record?.justify ?? 'start';

  const [draft, setDraft] = useState(savedContent);
  const { setDirty } = useObjectCanvasDirty();

  const save = useCallback(
    content => {
      if (!name || typeof saveMarkdown !== 'function') return undefined;
      return saveMarkdown(name, { name, content, align, justify });
    },
    [name, saveMarkdown, align, justify]
  );
  const { scheduleSave } = useDebouncedSave(save, { delay: SAVE_DELAY_MS });

  // Re-seed the draft when the active object changes (the frame reuses this
  // body across sibling selections, so without this the previous object's draft
  // would leak). We key on `name` so an external save (which updates
  // `savedContent`) does NOT clobber in-flight typing.
  const seededNameRef = useRef(null);
  useEffect(() => {
    if (seededNameRef.current !== name) {
      seededNameRef.current = name;
      setDraft(savedContent);
    }
  }, [name, savedContent]);

  const isDirty = draft !== savedContent;
  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  const handleChange = e => {
    const next = e.target.value;
    setDraft(next);
    if (next !== savedContent) scheduleSave(next);
  };

  if (!name) {
    return (
      <div
        data-testid="markdown-editor-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">No markdown selected.</span>
      </div>
    );
  }

  const previewConfig = { name, content: draft, align, justify };

  return (
    <div
      data-testid="markdown-editor-canvas"
      className="flex flex-1 min-h-0 min-w-0 divide-x divide-gray-200 bg-white"
    >
      {/* Editor pane */}
      <div className="flex min-h-0 w-1/2 flex-col">
        <div
          className={`flex items-center gap-2 border-b ${colors.border} ${colors.bg} px-4 py-2`}
        >
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${colors.text}`}>
            Markdown
          </span>
          <span className="text-[11px] text-gray-500">CommonMark · GFM · raw HTML</span>
        </div>
        <textarea
          data-testid="markdown-editor-textarea"
          aria-label="Markdown content"
          value={draft}
          onChange={handleChange}
          spellCheck={false}
          placeholder="# Start writing markdown…"
          className="flex-1 resize-none bg-white p-4 font-mono text-[13px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-300 focus:ring-0"
        />
      </div>

      {/* Live preview pane */}
      <div className="flex min-h-0 w-1/2 flex-col">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Preview
          </span>
        </div>
        <div
          data-testid="markdown-editor-preview"
          className="flex-1 min-h-0 overflow-auto p-4"
        >
          <div className="mx-auto w-full max-w-[720px]">
            <Markdown markdown={previewConfig} row={{ height: 'medium' }} height="100%" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarkdownEditorCanvas;
