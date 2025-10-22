import React, { useState } from 'react';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const TestExpansion = () => {
  const [expandedNodes, setExpandedNodes] = useState([]);

  const handleNodeToggle = (event, nodeIds) => {
    setExpandedNodes(nodeIds);
  };

  // Test with base64 encoded IDs like our real implementation
  const sourceId = btoa(JSON.stringify({ type: 'source', path: ['test_source'] }));
  const dbId = btoa(JSON.stringify({ type: 'database', path: ['test_source', 'test_db'] }));
  const schemaId = btoa(
    JSON.stringify({ type: 'schema', path: ['test_source', 'test_db', 'public'] })
  );
  const tableId = btoa(
    JSON.stringify({ type: 'table', path: ['test_source', 'test_db', 'public', 'users'] })
  );

  return (
    <div style={{ padding: '20px' }}>
      <h3>Test Tree Expansion</h3>
      <div>Expanded nodes: {JSON.stringify(expandedNodes)}</div>

      <SimpleTreeView
        slots={{
          collapseIcon: ExpandMoreIcon,
          expandIcon: ChevronRightIcon,
        }}
        expandedItems={expandedNodes}
        onExpandedItemsChange={handleNodeToggle}
      >
        <TreeItem itemId={sourceId} label="Test Source">
          <TreeItem itemId={dbId} label="Test Database">
            <TreeItem itemId={schemaId} label="Public Schema">
              <TreeItem itemId={tableId} label="Users Table">
                <TreeItem itemId="col1" label="ID Column" />
                <TreeItem itemId="col2" label="Name Column" />
              </TreeItem>
            </TreeItem>
          </TreeItem>
        </TreeItem>
      </SimpleTreeView>
    </div>
  );
};

export default TestExpansion;
