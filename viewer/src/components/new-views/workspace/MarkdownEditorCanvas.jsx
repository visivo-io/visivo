import React, { useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../../stores/store';
import Markdown from '../../items/Markdown';
import { getTypeColors } from '../common/objectTypeConfigs';
import { useObjectCanvasDirty } from './ObjectCanvasFrame';
import useRecordSave from '../../../hooks/useRecordSave';

/**
 * MarkdownEditorCanvas — VIS-1010 / VIS-1018 step 2.
 *
 * The editable `edit` lens of the markdown object canvas. A clean split surface:
 * a plain-text markdown editor on the LEFT, a LIVE rendered preview on the RIGHT
 * (reusing the same <Markdown> renderer the Dashboard mounts for a markdown
 * item, so what you type is exactly what ships).
 *
 * Behaviour:
 *   - owns a LOCAL draft of the record's markdown content for responsive typing
 *     (align / justify are preserved from the saved record so a content edit
 *     never drops them);
 *   - routes every keystroke through the unified `useRecordSave('markdown', …)`
 *     backbone: the keystroke writes the draft into the record's store
 *     collection OPTIMISTICALLY (`updateRecordConfigOptimistic`) AND schedules a
 *     debounced persist that reads the CURRENT store value at fire time. This is
 *     the VIS-1018 clobber fix — the rail form, this canvas, and the standalone
 *     rail-save now share ONE optimistic store + fire-time-read persist, so two
 *     surfaces editing the same markdown converge on the last write instead of
 *     racing stale per-surface drafts back over each other;
 *   - re-seeds its local draft ONLY on record `name` change (not on every store
 *     update) so a concurrent save can't interrupt in-flight typing;
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
  // (the store refreshes it after every save, and `updateRecordConfigOptimistic`
  // writes the in-flight draft into it). We seed the draft from it / the
  // frame-resolved record and re-seed when the selected object changes.
  const markdowns = useStore(s => s.markdowns);

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

  // Unified optimistic + debounced save backbone (VIS-1018). The hook reads the
  // CURRENT store value at fire time, so the persist always reflects the latest
  // edit across every surface bound to this markdown.
  const { scheduleSave } = useRecordSave('markdown', name, { delay: SAVE_DELAY_MS });

  // Re-seed the draft when the active object changes (the frame reuses this
  // body across sibling selections, so without this the previous object's draft
  // would leak). We key on `name` so an external save (which updates
  // `savedContent`) does NOT clobber in-flight typing. `seededContentRef` keeps
  // the baseline this record was loaded with — `savedContent` now tracks the
  // OPTIMISTIC store (it mirrors in-flight edits via `updateRecordConfigOptimistic`),
  // so it can't be the dirty baseline.
  const seededNameRef = useRef(null);
  const seededContentRef = useRef(savedContent);
  useEffect(() => {
    if (seededNameRef.current !== name) {
      seededNameRef.current = name;
      seededContentRef.current = savedContent;
      setDraft(savedContent);
    }
  }, [name, savedContent]);

  // Dirty === the draft differs from the content this record was SEEDED with
  // (what's on disk), not from the live optimistic store value.
  const isDirty = draft !== seededContentRef.current;
  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  const handleChange = e => {
    const next = e.target.value;
    setDraft(next);
    if (!name) return;
    // Push the keystroke through the shared optimistic store + debounced persist.
    // We schedule whenever the content differs from the SEEDED baseline (what's
    // on disk) — including typing back to it, so the revert persists too.
    // align/justify are preserved from the saved record so a content edit never
    // drops them.
    if (next !== seededContentRef.current) {
      scheduleSave({ name, content: next, align, justify });
    }
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
