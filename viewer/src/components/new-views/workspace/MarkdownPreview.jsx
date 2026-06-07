import React, { useEffect, useMemo } from 'react';
import useStore from '../../../stores/store';
import Markdown from '../../items/Markdown';

/**
 * MarkdownPreview — VIS-795 / N-3.
 *
 * Renders the active markdown object full-size via the EXISTING markdown render
 * path (`<Markdown>`, the same component the Dashboard mounts for a markdown
 * item). No editing affordances — editing lives in the right rail.
 *
 * The markdown record is resolved from the markdown store collection by name
 * (mirroring RightRailEditPanel's COLLECTION_KEY['markdown'] = 'markdowns').
 * <Markdown> takes `markdown` (the config), a `row` (for height behaviour) and
 * an optional `height`; the preview gives it a non-compact row so the content
 * scrolls within the pane.
 */
const MarkdownPreview = ({ activeObject }) => {
  const name = activeObject?.name || null;
  const markdowns = useStore(s => s.markdowns);
  const fetchMarkdowns = useStore(s => s.fetchMarkdowns);

  useEffect(() => {
    if ((!markdowns || markdowns.length === 0) && typeof fetchMarkdowns === 'function') {
      fetchMarkdowns();
    }
  }, [markdowns, fetchMarkdowns]);

  const record = useMemo(
    () => (Array.isArray(markdowns) ? markdowns.find(m => m.name === name) || null : null),
    [markdowns, name]
  );

  const markdownConfig = useMemo(() => {
    if (!record) return null;
    const config = record.config || record;
    return { name: record.name, ...config };
  }, [record]);

  if (!markdownConfig) {
    return (
      <div
        data-testid="markdown-preview-empty"
        className="flex flex-1 items-center justify-center bg-gray-50 p-8 text-center"
      >
        <span className="text-sm text-gray-500">
          {name ? `Markdown "${name}" not found.` : 'No markdown selected.'}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="markdown-preview"
      className="flex flex-1 min-h-0 overflow-auto bg-white p-6"
    >
      <div className="mx-auto w-full max-w-[820px]">
        <Markdown markdown={markdownConfig} row={{ height: 'medium' }} height="100%" />
      </div>
    </div>
  );
};

export default MarkdownPreview;
