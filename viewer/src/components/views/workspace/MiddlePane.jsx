import React from 'react';
import SubBar, { PreviewLensPicker } from './SubBar';
import ProjectCanvas from '../project/canvas/ProjectCanvas';
import ProjectEditor from '../project/editor/ProjectEditor';
import LineageCanvas from '../lineage/LineageCanvas';
import ObjectCanvasFrame from './ObjectCanvasFrame';
import useStore from '../../../stores/store';
import { getTypeIcon, getTypeColors } from '../common/objectTypeConfigs';

// The Semantic Layer page (VIS-1014) is heavy (React-Flow), so lazy-load it like
// the per-object canvas bodies — it only loads when the page is opened.
const SemanticLayerCanvas = React.lazy(() => import('./relations/SemanticLayerCanvas'));

/**
 * MiddlePane — dispatches on `activeObject.type` (VIS-775 / Track B B2).
 *
 *   project    → ProjectEditor (Track M M-1 — health row + level groups)
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

const ProjectPane = ({ activeObject }) => {
  const projectName = activeObject?.name || 'project';
  return (
    <section
      data-testid="workspace-middle-project"
      className="flex h-full w-full flex-col bg-gray-50"
    >
      <SubBar
        testId="workspace-subbar-project"
        left={
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-semibold text-gray-900">{projectName}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">project</span>
          </div>
        }
      />
      <ProjectEditor />
    </section>
  );
};

// The project-wide Semantic Layer page (VIS-1014). A NEW multi-object surface
// (NOT a per-object canvas): an ERD of every model with its metrics + dimensions
// and all relations as edges. Reached from the Project view's "Semantic Layer"
// button (which opens a `{ type: 'semantic-layer' }` workspace tab).
const RelationIcon = getTypeIcon('relation');
const RELATION_COLORS = getTypeColors('relation');

const SemanticLayerPane = () => (
  <section
    data-testid="workspace-middle-semantic-layer"
    className="flex h-full w-full flex-col bg-gray-50"
  >
    <SubBar
      testId="workspace-subbar-semantic-layer"
      left={
        <div className="flex items-center gap-2 text-[12px]">
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded ${RELATION_COLORS.bg} ${RELATION_COLORS.text}`}
          >
            {RelationIcon && <RelationIcon style={{ fontSize: 13 }} />}
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
  const lens = useStore(s => s.workspaceLens);
  const onLensChange = useStore(s => s.setWorkspaceLens);
  const project = useStore(s => s.project);
  const projectId = project?.id || null;
  const obj = activeObject || { type: 'project', name: 'project' };

  if (obj.type === 'project') {
    return <ProjectPane activeObject={obj} />;
  }
  if (obj.type === 'semantic-layer') {
    return <SemanticLayerPane />;
  }
  if (obj.type === 'dashboard') {
    return (
      <DashboardPane
        activeObject={obj}
        lens={lens}
        onLensChange={onLensChange}
        projectId={projectId}
      />
    );
  }
  return <PerObjectPane activeObject={obj} projectId={projectId} />;
};

export default MiddlePane;
