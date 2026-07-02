import React from 'react';
import { PiSquaresFour, PiTreeStructure } from 'react-icons/pi';
import Segmented from './Segmented';

/**
 * SubBar — h-9 white bar above the middle-pane viewport.
 *
 * Per the delivered B-1 design (`design/cofounder-mockups/`), every preview
 * surface shares this pattern: `<name> · <metadata>` on the LEFT, view
 * switcher on the RIGHT. Single visual idiom across dashboards, charts,
 * insights, models, and tables — adding a new object type means adding a
 * new MiddlePane variant that reuses `<SubBar>` (Track N).
 */
export const SubBar = ({ left, right, testId = 'workspace-subbar' }) => {
  return (
    <div
      data-testid={testId}
      className="flex h-9 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3"
    >
      <div className="min-w-0 flex-1 truncate">{left}</div>
      <div className="shrink-0">{right}</div>
    </div>
  );
};

/**
 * PreviewLensPicker — the `[Canvas | Lineage]` / `[Preview | Lineage]`
 * segmented lives in the sub-bar, NOT in the top bar. View switcher
 * belongs next to the thing it's switching the view of (per the chat
 * transcript in `design/cofounder-mockups/chats/chat1.md`).
 *
 * The first lens is labelled "Canvas" for EVERY object type (dashboards and
 * per-object surfaces alike) — a single consistent name avoids the cognitive
 * load of the tab renaming itself per selection. `previewLabel` stays
 * overridable but defaults to "Canvas". `previewDisabled` is the
 * lineage-fallback case — object types that don't have a canvas component yet
 * (e.g. Phase 0 models) stay parked on Lineage and the Canvas lens reads muted.
 */
export const PreviewLensPicker = ({
  value,
  onChange,
  previewLabel = 'Canvas',
  previewDisabled = false,
  testId = 'workspace-lens-picker',
}) => {
  return (
    <Segmented
      ariaLabel="View"
      tone="light"
      value={value}
      onChange={onChange}
      testId={testId}
      options={[
        {
          value: 'preview',
          label: previewLabel,
          icon: PiSquaresFour,
          disabled: previewDisabled,
          title: previewDisabled
            ? 'No preview available yet — showing lineage'
            : undefined,
        },
        {
          value: 'lineage',
          label: 'Lineage',
          icon: PiTreeStructure,
        },
      ]}
    />
  );
};

export default SubBar;
