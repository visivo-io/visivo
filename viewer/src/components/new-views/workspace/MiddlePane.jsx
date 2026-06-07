import React from 'react';
import SubBar, { PreviewLensPicker } from './SubBar';
import ProjectCanvas from '../project/canvas/ProjectCanvas';
import ProjectEditor from '../project/editor/ProjectEditor';
import LineageCanvas from '../lineage/LineageCanvas';
import { getPreviewComponent } from './previewRegistry';
import useStore from '../../../stores/store';

/**
 * MiddlePane — dispatches on `activeObject.type` (VIS-775 / Track B B2).
 *
 *   project    → ProjectEditor (Track M M-1 — health row + level groups)
 *   dashboard  → ProjectCanvas (render-only Dashboard wrapper, VIS-767) when
 *                scoped, placeholder otherwise; the Lineage lens mounts <LineageCanvas>
 *   _          → PerObjectPane (chart/model/insight/input/table/markdown/
 *                source/dimension/metric/relation/unknown). Track-N types
 *                (chart/table/markdown/input/insight/model) mount their custom
 *                Preview component (from previewRegistry, reusing the existing
 *                renderer) in the Preview lens; every other type has no preview
 *                and falls back to the universal Lineage lens (VIS-779),
 *                mounting <LineageCanvas> with the Preview option muted.
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

const PerObjectPane = ({ activeObject, projectId }) => {
  const name = activeObject?.name || '(unnamed)';
  const type = activeObject?.type || 'object';
  // Track N: a subset of object types (chart / table / markdown / input /
  // insight / model) now have a custom Preview component registered in
  // previewRegistry; each reuses that type's EXISTING renderer. Types WITHOUT a
  // registered preview (source, dimension, metric, relation, unknown, …) have no
  // preview surface, so they default to — and stay parked on — the universal
  // Lineage lens (VIS-779), with the Preview option muted (N-7 / VIS-803 is
  // canceled; the fallback is the plain Lineage lens, not a bespoke component).
  const PreviewComponent = getPreviewComponent(type);
  const hasPreview = Boolean(PreviewComponent);
  // Types with a custom preview default to the Preview lens (it's their primary
  // surface); fallback types default to — and lock onto — Lineage. The shared
  // store lens defaults to 'preview' (the dashboard *canvas* default), which is
  // not meaningful for objects with no preview surface, so the per-object lens
  // is tracked locally.
  const [lensEffective, setLensEffective] = React.useState(
    hasPreview ? 'preview' : 'lineage'
  );
  // A fallback type can never show Preview — clamp any stale 'preview' selection.
  const lens = hasPreview ? lensEffective : 'lineage';
  return (
    <section
      data-testid={`workspace-middle-${type}`}
      className="flex h-full w-full flex-col bg-gray-50"
    >
      <SubBar
        testId={`workspace-subbar-${type}`}
        left={
          <div className="flex items-center gap-2 text-[12px]">
            <span className="font-semibold text-gray-900">{name}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{type}</span>
          </div>
        }
        right={
          <PreviewLensPicker
            value={lens}
            onChange={setLensEffective}
            previewLabel="Preview"
            previewDisabled={!hasPreview}
          />
        }
      />
      {lens === 'lineage' ? (
        <div
          data-testid={`workspace-middle-${type}-lineage`}
          className="flex flex-1 min-h-0"
        >
          <LineageCanvas />
        </div>
      ) : (
        <div
          data-testid={`workspace-middle-${type}-preview`}
          className="flex flex-1 min-h-0"
        >
          <PreviewComponent activeObject={activeObject} projectId={projectId} />
        </div>
      )}
    </section>
  );
};

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
  // Every non-dashboard object (chart, model, insight, input, table, markdown,
  // source, dimension, metric, relation, unknown) routes through PerObjectPane.
  // Track-N types render their custom Preview; the rest fall back to the
  // universal Lineage lens (VIS-779).
  return <PerObjectPane activeObject={obj} projectId={projectId} />;
};

export default MiddlePane;
