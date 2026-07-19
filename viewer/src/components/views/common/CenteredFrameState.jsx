import React from 'react';

/**
 * CenteredFrameState — Explore 2.0 Phase 5 (VIS-1071, 01-ux-spec.md §7's
 * "Consolidate the three near-duplicate centered-card state components...
 * into one shared component"). One shared "centered white card on a gray
 * backdrop" empty/loading/error state, replacing FOUR near-identical
 * hand-rolled copies (the spec names three; a fourth turned up during the
 * sweep — `ExplorationPane.jsx` had its own separate `FrameState` with the
 * same name as `ObjectCanvasFrame.jsx`'s, plus a `spin` prop neither of the
 * other two had):
 *
 *   - `ObjectCanvasFrame.jsx`'s `FrameState`
 *   - `ExplorationPane.jsx`'s (separately-defined, same-named) `FrameState`
 *   - `RelationErdCanvas.jsx`'s `ErdEmptyState`
 *   - `SourceErd.jsx`'s `FrameMessage`
 *
 * `icon` is optional (omit/pass `null` for a text-only card — matches the
 * original `ErdEmptyState`, which never had one); `spin` adds
 * `animate-spin` (matches `ExplorationPane`'s loading variant); `maxWidth`
 * defaults to 420px (matches three of the four originals — `ErdEmptyState`
 * used 360px, preserved via the prop at its call site).
 */
const CenteredFrameState = ({
  testId,
  title,
  body,
  icon: Icon = null,
  spin = false,
  maxWidth = 420,
}) => (
  <div
    data-testid={testId}
    className="flex flex-1 items-center justify-center bg-gray-50 p-12 text-center"
  >
    <div
      data-testid={testId ? `${testId}-card` : undefined}
      className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
      style={{ maxWidth }}
    >
      {Icon && (
        <Icon
          className={`mx-auto mb-2 h-6 w-6 text-gray-300 ${spin ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
      )}
      <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      {body && (
        <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-gray-500">
          {body}
        </p>
      )}
    </div>
  </div>
);

export default CenteredFrameState;
