import React from 'react';
import SubBar from '../SubBar';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';

const ExplorerIcon = getTypeIcon('explorer');
const EXPLORER_COLORS = getTypeColors('explorer');

/**
 * ExplorerHomePane — the `explorer` destination's Home (Explore 2.0 Phase 0,
 * `higherLevelViews.js`). A CLEAN PLACEHOLDER: explorations (the first-class
 * objects this Home will gallery — see
 * `specs/plan/explorer-workspace-unification/01-ux-spec.md` §2) don't exist
 * yet — they land in Phase 2. This pane exists now so the view switcher's
 * third row has somewhere real to point at, validating the 3-destination
 * switcher end-to-end; Phase 2 swaps in the real Explorer Home gallery
 * (start-from-source tiles, recent/parked exploration cards) behind this same
 * registry entry.
 */
const ExplorerHomePane = () => (
  <section
    data-testid="workspace-middle-explorer"
    className="flex h-full w-full flex-col bg-gray-50"
  >
    <SubBar
      testId="workspace-subbar-explorer"
      left={
        <div className="flex items-center gap-2 text-[12px]">
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded ${EXPLORER_COLORS.bg} ${EXPLORER_COLORS.text}`}
          >
            {ExplorerIcon && <ExplorerIcon style={{ fontSize: 13 }} />}
          </span>
          <span className="font-semibold text-gray-900">Explorer</span>
        </div>
      }
    />
    <div
      data-testid="workspace-middle-explorer-empty"
      className="flex flex-1 items-center justify-center p-12"
    >
      <div className="max-w-[440px] rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-[16px] font-semibold text-gray-900">
          Explorer arrives with explorations
        </h2>
        <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-gray-500">
          Scratch SQL, draft insights, and one-click "Explore this" land in a
          later phase of the Explore 2.0 rollout.
        </p>
      </div>
    </div>
  </section>
);

export default ExplorerHomePane;
