import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../../../stores/store';

/**
 * useActiveObject — the active object derived from the workspace store.
 *
 * Mirrors what the smart `Workspace` container used to compute and prop-drill
 * into MiddlePane + RightRail. Falls back through:
 *   1. the active tab's `{ type, name }`;
 *   2. a synthesised dashboard descriptor when the URL is scoped but the
 *      tab hasn't hydrated yet (avoids a flash of "project" content);
 *   3. the project tab as the unscoped default.
 *
 * Children that need the active object call this hook directly instead of
 * receiving an `activeObject` prop.
 */
export function useActiveObject() {
  const { dashboardName } = useParams();
  const tabs = useStore(s => s.workspaceTabs);
  const activeTabId = useStore(s => s.workspaceActiveTabId);
  const project = useStore(s => s.project);

  const projectName = project?.project_json?.name || project?.name || 'project';

  return useMemo(() => {
    const tab = (tabs || []).find(t => t.id === activeTabId);
    if (tab) return { type: tab.type, name: tab.name };
    if (dashboardName) return { type: 'dashboard', name: dashboardName };
    return { type: 'project', name: projectName };
  }, [tabs, activeTabId, dashboardName, projectName]);
}

export default useActiveObject;
