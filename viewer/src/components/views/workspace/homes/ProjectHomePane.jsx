import React from 'react';
import SubBar from '../SubBar';
import ProjectEditor from '../../project/editor/ProjectEditor';
import useStore from '../../../../stores/store';

/**
 * ProjectHomePane — the `project` destination's Home (Explore 2.0 Phase 0,
 * `higherLevelViews.js`). Moved out of `MiddlePane.jsx` verbatim (previously
 * `ProjectPane`) so it can be lazy-loaded through the view registry like the
 * other two destinations. Reads the project name from the store directly —
 * registry HomePanes take no props (they mount via `<HomePane />`).
 */
const ProjectHomePane = () => {
  const project = useStore(s => s.project);
  const projectName = project?.project_json?.name || project?.name || 'project';
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

export default ProjectHomePane;
