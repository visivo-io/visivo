import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PiWarningCircle } from 'react-icons/pi';
import useStore from '../../../stores/store';
import { findLatestRunFailureFor } from '../../../stores/runFailures';

/**
 * RecordRunStatus — VIS-993 §2 (folds VIS-981's wiring).
 *
 * The run-failure loop-back for editing surfaces: a compact banner rendered
 * under a record's SelectionChip that surfaces the failure of the run this
 * record's save triggered — ON the record, not only as a global indicator.
 *
 * Subscribes to the run slice's `runs` list (populated by pollRuns from
 * GET /api/projects/<id>/run/ in cloud; stays [] where the endpoint 404s —
 * local serve / dist — so this renders nothing there until Tim's
 * runs-on-changes branch lands the local endpoint). The failure semantics
 * live in stores/runFailures.js: the latest non-superseded FAILED run whose
 * dag_filter mentions `name`, cleared by a newer succeeded run mentioning it.
 *
 * The "View runs" link is gated behind `showRunsLink` (default OFF):
 * LocalRouter has no /runs route and no catch-all — createBrowserRouter
 * renders its DEFAULT error boundary for unmatched paths, replacing the whole
 * app, so an always-on link would hard-break today.
 * TODO(VIS-1028): default the link ON (or drop the prop) once the /runs
 * surface exists in the router.
 */
const RecordRunStatus = ({ name, showRunsLink = false }) => {
  const runs = useStore(s => s.runs);
  const failure = useMemo(() => findLatestRunFailureFor(runs, name), [runs, name]);

  if (!failure) return null;

  return (
    <div
      data-testid="record-run-status"
      role="status"
      className="flex items-start gap-2 border-b border-[#d25946]/30 bg-[#fdf5f3] px-3 py-2"
    >
      <PiWarningCircle
        aria-hidden="true"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d25946]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-semibold text-[#d25946]">Last run failed</p>
        <p className="truncate text-[11px] text-[#a03c2d]" title={failure.error}>
          {failure.error}
        </p>
      </div>
      {showRunsLink && (
        <Link
          to="/runs"
          data-testid="record-run-status-view-runs"
          className="shrink-0 text-[11px] font-medium text-[#d25946] underline transition-colors hover:text-[#a03c2d]"
        >
          View runs
        </Link>
      )}
    </div>
  );
};

export default RecordRunStatus;
