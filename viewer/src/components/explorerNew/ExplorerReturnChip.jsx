import React, { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PiArrowLeft } from 'react-icons/pi';
import { getTypeColors } from '../new-views/common/objectTypeConfigs';

/**
 * ExplorerReturnChip — VIS-782 / J-3.
 *
 * A breadcrumb chip rendered in Explorer's top bar ONLY when the user arrived
 * from Build mode via "Open in Explorer" (URL carries `?return_to=workspace`).
 * Clicking it returns to the originating dashboard in Workspace.
 *
 * The chip wears the dashboard type colour (rose) from objectTypeConfigs — no
 * hand-rolled palette — so it visually reads as "back to a dashboard".
 *
 * Renders nothing for a normal Explorer entry (no params) so Explorer's chrome
 * is untouched in the default case.
 */
const ExplorerReturnChip = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const returnTo = searchParams.get('return_to');
  const dashboard = searchParams.get('dashboard');

  const handleClick = useCallback(() => {
    if (!dashboard) return;
    navigate(`/workspace/dashboard/${encodeURIComponent(dashboard)}`);
  }, [navigate, dashboard]);

  if (returnTo !== 'workspace' || !dashboard) return null;

  const { bg, text, border, bgHover } = getTypeColors('dashboard');

  return (
    <button
      type="button"
      data-testid="explorer-return-chip"
      onClick={handleClick}
      title={`Back to dashboard '${dashboard}'`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${bg} ${text} ${border} ${bgHover} cursor-pointer`}
    >
      <PiArrowLeft size={14} aria-hidden="true" />
      <span>
        Back to dashboard{' '}
        <span className="font-semibold">&lsquo;{dashboard}&rsquo;</span>
      </span>
    </button>
  );
};

export default ExplorerReturnChip;
