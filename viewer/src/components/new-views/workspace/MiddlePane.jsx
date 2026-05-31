import React from 'react';
import SubBar, { PreviewLensPicker } from './SubBar';
import DashboardNew from '../project/DashboardNew';
import ProjectEditor from '../project/editor/ProjectEditor';
import LineageCanvas from '../lineage/LineageCanvas';
import useStore from '../../../stores/store';

/**
 * MiddlePane — dispatches on `activeObject.type` (VIS-775 / Track B B2).
 *
 *   project    → ProjectEditor (Track M M-1 — health row + level groups)
 *   dashboard  → DashboardNew (existing renderer) when scoped, placeholder
 *                otherwise; the Lineage lens mounts <LineageCanvas>
 *   _          → PerObjectPane (chart/model/insight/input/table/markdown/
 *                source/dimension/metric/relation/unknown). The Lineage lens is
 *                universal (VIS-779) and the per-object default — it mounts
 *                <LineageCanvas>; the Preview lens shows the Track N placeholder.
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
          <DashboardNew projectId={projectId} dashboardName={name} />
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

const PerObjectPane = ({ activeObject }) => {
  const name = activeObject?.name || '(unnamed)';
  const type = activeObject?.type || 'object';
  // No custom previews exist yet (Track N), so Lineage is the default lens for
  // any selected non-dashboard object — selecting one immediately shows its DAG
  // via <LineageCanvas> (scoped through useWorkspaceScope). The shared store
  // lens defaults to 'preview' (the dashboard *canvas* default), which is not a
  // meaningful default for objects with no preview surface, so the per-object
  // lens is tracked locally and defaults to 'lineage'. Preview stays selectable
  // in the picker (it shows the Track N placeholder until custom previews ship).
  const [lensEffective, setLensEffective] = React.useState('lineage');
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
            value={lensEffective}
            onChange={setLensEffective}
            previewLabel="Preview"
          />
        }
      />
      {lensEffective === 'lineage' ? (
        <div
          data-testid={`workspace-middle-${type}-lineage`}
          className="flex flex-1 min-h-0"
        >
          <LineageCanvas />
        </div>
      ) : (
        <Placeholder
          testId={`workspace-middle-${type}-placeholder`}
          title="Per-object preview coming soon (Track N)"
          body={`Custom previews for ${type}s ship in Phase 4. The Lineage lens shows this object's DAG today.`}
        />
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
  // source, dimension, metric, relation, unknown) routes through PerObjectPane,
  // which defaults to the universal Lineage lens (VIS-779).
  return <PerObjectPane activeObject={obj} />;
};

export default MiddlePane;
