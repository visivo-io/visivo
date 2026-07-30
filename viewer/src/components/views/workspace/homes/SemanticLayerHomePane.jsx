import React from 'react';
import SubBar from '../SubBar';
import { getTypeIcon, getTypeColors } from '../../common/objectTypeConfigs';

// The project-wide Semantic Layer page (VIS-1014). A NEW multi-object surface
// (NOT a per-object canvas): an ERD of every model with its metrics + dimensions
// and all relations as edges. Reached from the view switcher's "Semantic
// Layer" row (Explore 2.0 Phase 0) — previously the Project view's button.
const SemanticLayerCanvas = React.lazy(() => import('../relations/SemanticLayerCanvas'));

// Icon/color resolve from `objectTypeConfigs.js`'s own `semantic-layer` entry
// (Phase 0 fixes B1 — this pane used to borrow the `relation` icon, which
// disagreed with the TabStrip's fallback icon for the same destination; now
// both the switcher and this pane resolve the SAME entry).
const SemanticLayerIcon = getTypeIcon('semantic-layer');
const SEMANTIC_LAYER_COLORS = getTypeColors('semantic-layer');

/**
 * SemanticLayerHomePane — the `semantic-layer` destination's Home (Explore 2.0
 * Phase 0, `higherLevelViews.js`). Moved out of `MiddlePane.jsx` verbatim
 * (previously `SemanticLayerPane`) so it lazy-loads through the view registry.
 */
const SemanticLayerHomePane = () => (
  <section
    data-testid="workspace-middle-semantic-layer"
    className="flex h-full w-full flex-col bg-gray-50"
  >
    <SubBar
      testId="workspace-subbar-semantic-layer"
      left={
        <div className="flex items-center gap-2 text-[12px]">
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded ${SEMANTIC_LAYER_COLORS.bg} ${SEMANTIC_LAYER_COLORS.text}`}
          >
            {SemanticLayerIcon && <SemanticLayerIcon style={{ fontSize: 13 }} />}
          </span>
          <span className="font-semibold text-gray-900">Semantic Layer</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-500">models · metrics · dimensions · relations</span>
        </div>
      }
    />
    <div data-testid="workspace-middle-semantic-layer-canvas" className="flex flex-1 min-h-0">
      <React.Suspense
        fallback={
          <div
            data-testid="workspace-middle-semantic-layer-loading"
            className="flex flex-1 items-center justify-center text-[13px] text-gray-400"
          >
            Loading semantic layer…
          </div>
        }
      >
        <SemanticLayerCanvas />
      </React.Suspense>
    </div>
  </section>
);

export default SemanticLayerHomePane;
