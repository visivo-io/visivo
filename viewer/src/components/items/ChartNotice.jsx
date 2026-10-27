import React, { useMemo } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import useStore from '../../stores/store';
import { findBuildFailureFor } from '../../stores/runFailures';
import { viewerPath } from '../../contexts/viewerBase';

const RunsLink = () => {
  const inRouter = useInRouterContext();
  const className = 'font-medium text-(--vt-text) underline';
  if (!inRouter) {
    return (
      <a href={viewerPath('/runs')} className={className}>
        Open the Runs page
      </a>
    );
  }
  return (
    <Link to={viewerPath('/runs')} className={className}>
      Open the Runs page
    </Link>
  );
};

const firstLine = text => String(text).split('\n')[0];

/**
 * What a chart shows instead of a plot when it has nothing to draw: its
 * insight has no built output (`missingInsightNames`), its data could not be
 * fetched (`loadError`), or every query returned zero rows.
 */
const ChartNotice = ({ chartName, chartTitle, missingInsightNames = [], loadError = null }) => {
  const runs = useStore(state => state.runs);
  const hasRunsPage = useStore(state => !!state.polledProjectId);

  const failure = useMemo(() => {
    for (const name of missingInsightNames) {
      const found = findBuildFailureFor(runs, name);
      if (found) return { ...found, name };
    }
    return null;
  }, [runs, missingInsightNames]);

  const isMissing = missingInsightNames.length > 0;
  const isLoadError = !isMissing && !!loadError;
  const isAlert = isMissing || isLoadError;
  let title;
  let detail;
  let testId = `chart_build_error_${chartName}`;
  if (isLoadError) {
    title = "This chart's data could not be loaded";
    detail = firstLine(loadError);
    testId = `chart_load_error_${chartName}`;
  } else if (!isMissing) {
    title = 'No rows match';
    testId = `chart_empty_${chartName}`;
    detail = "The chart's query returned no rows. Check its filters and input selections.";
  } else if (failure) {
    const object = failure.diagnostic?.object;
    const label = object?.name && object.name !== failure.name ? `'${object.name}': ` : '';
    title = "This chart's data failed to build";
    detail = `${label}${firstLine(failure.error)}`;
  } else {
    title = "This chart's data has not been built";
    detail = `No built output was found for insight '${missingInsightNames[0]}'.`;
  }

  return (
    <div className="flex h-full w-full flex-col text-(--vt-text)">
      {chartTitle && <p className="truncate px-2 pt-2 text-base">{chartTitle}</p>}
      <div
        role={isAlert ? 'alert' : 'status'}
        data-testid={testId}
        className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-6 text-center text-sm"
      >
        <p className={`font-semibold ${isAlert ? 'text-red-500' : ''}`}>{title}</p>
        <p
          className={`max-w-md break-words text-xs text-(--vt-muted) line-clamp-4 ${
            failure || isLoadError ? 'font-mono' : ''
          }`}
        >
          {detail}
        </p>
        {isMissing && (
          <p className="mt-1 text-xs">
            {hasRunsPage ? <RunsLink /> : 'Run the project to build it.'}
          </p>
        )}
        {isLoadError && <p className="mt-1 text-xs">Reload the page to try again.</p>}
      </div>
    </div>
  );
};

export default ChartNotice;
