import React from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const DebugTreePage = () => {
  const [expandedNodes, setExpandedNodes] = React.useState([]);
  const [eventLog, setEventLog] = React.useState([]);

  const addLog = message => {
    setEventLog(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  const handleExpandedItemsChange = (event, nodeIds) => {
    addLog(`onExpandedItemsChange called with: ${JSON.stringify(nodeIds)}`);
    setExpandedNodes(nodeIds);
  };

  // Create node IDs like our real implementation
  const sourceId = btoa(JSON.stringify({ type: 'source', path: ['test_source'] }));
  const dbId = btoa(JSON.stringify({ type: 'database', path: ['test_source', 'test_db'] }));
  const schemaId = btoa(
    JSON.stringify({ type: 'schema', path: ['test_source', 'test_db', 'public'] })
  );

  return (
    <div style={{ padding: '20px', display: 'flex', gap: '20px' }}>
      <div style={{ flex: 1 }}>
        <h3>Debug Tree</h3>
        <p>Current expanded: {JSON.stringify(expandedNodes)}</p>

        <SimpleTreeView
          slots={{
            collapseIcon: ExpandMoreIcon,
            expandIcon: ChevronRightIcon,
          }}
          expandedItems={expandedNodes}
          onExpandedItemsChange={handleExpandedItemsChange}
        >
          <TreeItem
            itemId={sourceId}
            label="Test Source"
            onClick={() => addLog(`TreeItem clicked: ${sourceId}`)}
          >
            <TreeItem
              itemId={dbId}
              label="Test Database"
              onClick={() => addLog(`TreeItem clicked: ${dbId}`)}
            >
              <TreeItem
                itemId={schemaId}
                label="Public Schema"
                onClick={() => addLog(`TreeItem clicked: ${schemaId}`)}
              >
                <TreeItem itemId="table1" label="Users Table" />
              </TreeItem>
            </TreeItem>
          </TreeItem>
        </SimpleTreeView>
      </div>

      <div style={{ flex: 1 }}>
        <h3>Event Log</h3>
        <div
          style={{
            height: '400px',
            overflow: 'auto',
            border: '1px solid #ccc',
            padding: '10px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          {eventLog.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DebugTreePage;
