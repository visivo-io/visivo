import React from 'react';
import SubBar, { PreviewLensPicker } from './SubBar';
import ProjectCanvas from '../project/canvas/ProjectCanvas';
import LineageCanvas from '../lineage/LineageCanvas';
import ObjectCanvasFrame from './ObjectCanvasFrame';
import useStore from '../../../stores/store';
import { getViewDescriptor, DEFAULT_WORKSPACE_VIEW } from './higherLevelViews';

/**
 * MiddlePane — dispatches on the active DOCUMENT tab, else the active
 * DESTINATION's Home pane (VIS-775 / Track B B2; Explore 2.0 Phase 0).
 *
 *   no active document tab → the active destination's HomePane, resolved from
 *                the `higherLevelViews.js` registry (Project / Semantic Layer /
 *                Explorer — D1). Destinations are never tab records
 *                (01-ux-spec.md §1), so this is the ONLY path that renders them
 *                — the old hardcoded `project`/`semantic-layer` branches here
 *                are gone, along with the per-file special-casing they invited.
 *   dashboard  → ProjectCanvas (render-only Dashboard wrapper, VIS-767) when
 *                scoped, placeholder otherwise; the Lineage lens mounts <LineageCanvas>
 *   _          → <ObjectCanvasFrame> (VIS-1001) — the shared per-object canvas
 *                shell. It resolves the type's descriptor from the object-canvas
 *                registry and mounts the right body / lens / canonical state.
 *                Types without a descriptor (source/dimension/metric/relation/
 *                unknown) park on the universal Lineage lens with Canvas muted.
 *
 * Each variant renders the `<SubBar>` above its viewport so the lens picker
 * stays close to the surface it switches the view of (per the chat
 * transcript in `design/cofounder-mockups/chats/chat1.md`).
 */

const Placeholder = ({ title, body, testId }) => (
  <div
    data-testid={testId}
    className="flex flex-1 items-center justify-center bg-gray-50 p-12"
  >
    <div className="max-w-[440px] rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
      {body && (
        <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-gray-500">
          {body}
        </p>
      )}
    </div>
  </div>
);

/**
 * The active destination's Home pane, resolved through the registry. Panes
 * import directly (not lazy at this level, see `higherLevelViews.js`) — any
 * heavy content lazy-loads INSIDE the pane itself.
 */
const DestinationHome = ({ view }) => {
  const descriptor = getViewDescriptor(view) || getViewDescriptor(DEFAULT_WORKSPACE_VIEW);
  const HomePane = descriptor.HomePane;
  return <HomePane />;
};

const DashboardPane = ({ activeObject, lens, onLensChange, projectId }) => {
  const name = activeObject?.name;
  return (
    <section
      data-testid="workspace-middle-dashboard"
      className="flex h-full w-full flex-col bg-gray-50"
    >
      <SubBar
        testId="workspace-subbar-dashboard"
        left={
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-semibold text-gray-900">{name}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">dashboard</span>
          </div>
        }
        right={
          <PreviewLensPicker
            value={lens}
            onChange={onLensChange}
            previewLabel="Canvas"
          />
        }
      />
      {lens === 'lineage' ? (
        <div
          data-testid="workspace-middle-dashboard-lineage"
          className="flex flex-1 min-h-0"
        >
          <LineageCanvas />
        </div>
      ) : name && projectId ? (
        <div
          data-testid="workspace-middle-dashboard-canvas"
          className="flex-1 overflow-auto"
        >
          <ProjectCanvas projectId={projectId} dashboardName={name} />
        </div>
      ) : (
        <Placeholder
          testId="workspace-middle-dashboard-placeholder"
          title="No dashboard scoped"
          body="Open a dashboard from the Library to start editing."
        />
      )}
    </section>
  );
};

// Every non-dashboard object (chart, model, insight, input, table, markdown,
// source, dimension, metric, relation, csvScriptModel, localMergeModel, unknown)
// routes through the shared ObjectCanvasFrame (VIS-1001), which owns the SubBar,
// the N-way lens picker, the per-object local lens, and the canonical states.
const PerObjectPane = ({ activeObject, projectId }) => (
  <ObjectCanvasFrame activeObject={activeObject} projectId={projectId} />
);

const MiddlePane = () => {
  // Everything the dispatcher needs comes from the store — no prop-drilling.
  const activeObject = useStore(s => s.workspaceActiveObject);
  const activeView = useStore(s => s.workspaceActiveView);
  const lens = useStore(s => s.workspaceLens);
  const onLensChange = useStore(s => s.setWorkspaceLens);
  const project = useStore(s => s.project);
  const projectId = project?.id || null;

  // No active document tab → a destination owns the center (D1). This is the
  // ONLY branch that can be true for `project`/`semantic-layer`/`explorer` —
  // they left the tab model in Phase 0, so `activeObject` is never one of them.
  if (!activeObject) {
    return <DestinationHome view={activeView} />;
  }
  if (activeObject.type === 'dashboard') {
    return (
      <DashboardPane
        activeObject={activeObject}
        lens={lens}
        onLensChange={onLensChange}
        projectId={projectId}
      />
    );
  }
  return <PerObjectPane activeObject={activeObject} projectId={projectId} />;
};

export default MiddlePane;
