import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

/**
 * Workspace — placeholder shell mounted by `/workspace` and `/workspace/dashboard/<name>`.
 *
 * VIS-772 (Track B B1) only adds the routes + redirects from `/editor` and `/lineage`.
 * The actual shell (top bar, tab strip, three rails, sub-bar, middle pane variants per
 * the delivered B-1 design) ships in VIS-775 (Track B B2). This stub exists so the new
 * routes have something to mount and so redirects land on a real component instead of
 * 404ing.
 *
 * See `specs/dashboard-building/implementation/design/cofounder-mockups/` for the
 * delivered B-1 design that B2 will implement against.
 */
const Workspace = () => {
  const { dashboardName } = useParams();
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const edit = searchParams.get('edit');

  return (
    <div
      data-testid="workspace-shell-stub"
      className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-600"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-medium text-gray-900">Workspace</h1>
        <p className="mt-2 text-sm">
          Workspace shell coming soon (VIS-775). This route + redirect plumbing ships in VIS-772.
        </p>
        <dl className="mt-4 inline-block rounded-md border border-gray-200 bg-white px-4 py-2 text-left text-xs text-gray-500">
          <div className="flex gap-2">
            <dt className="font-medium text-gray-700">dashboardName:</dt>
            <dd data-testid="workspace-scope-dashboard">{dashboardName ?? '(unscoped)'}</dd>
          </div>
          {view && (
            <div className="flex gap-2">
              <dt className="font-medium text-gray-700">?view=</dt>
              <dd data-testid="workspace-query-view">{view}</dd>
            </div>
          )}
          {edit && (
            <div className="flex gap-2">
              <dt className="font-medium text-gray-700">?edit=</dt>
              <dd data-testid="workspace-query-edit">{edit}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
};

export default Workspace;
