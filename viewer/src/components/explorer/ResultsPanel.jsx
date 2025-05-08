import React from 'react';
import { Panel } from '../styled/Panel';
import Table from '../items/Table';
import useExplorerStore from '../../stores/explorerStore';

const ResultsPanel = ({ project }) => {
  const { results, queryStats, splitRatio } = useExplorerStore();

  return (
    <Panel style={{ flex: 1 - splitRatio }}>
      <div className="flex justify-between items-center mb-4 w-full">
        <h2 className="text-lg font-semibold">Results</h2>
        {queryStats && (
          <div className="text-sm text-gray-600 font-medium">
            {queryStats && (
              <>
                {`Last Run at ${new Date(queryStats.timestamp).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })} • ${queryStats.executionTime}s`}
                {queryStats.source && ` • Source: ${queryStats.source}`}
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {results && <Table table={results} project={project} height="100%" />}
      </div>
    </Panel>
  );
};

export default ResultsPanel;
