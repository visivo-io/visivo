import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactFlow from 'reactflow';
import 'reactflow/dist/style.css';
import useStore from '../../stores/store'; // Adjust path to your store
import ObjectPillNode from './ObjectPillNode';
import { parseSelector, filterGraph, computeLayout } from './graphUtils';
import useDag from '../../hooks/useDag';
import { Button } from '../styled/Button';
import { MdOutlineZoomOutMap } from 'react-icons/md';

const Lineage = ({ defaultSelector = '' }) => {
  const namedChildren = useStore(state => state.namedChildren);
  const [selector, setSelector] = useState(defaultSelector);
  const reactFlowInstance = useRef(null);

  const { nodes: fullNodes, edges: fullEdges } = useDag();

  const layoutNodes = useMemo(() => computeLayout(fullNodes, fullEdges), [fullNodes, fullEdges]);
  const nodeTypes = useMemo(() => ({ objectPill: ObjectPillNode }), []);

  const selectedNodes = useMemo(
    () => parseSelector(selector, namedChildren),
    [selector, namedChildren]
  );

  const { nodes: filteredNodes, edges: filteredEdges } = useMemo(
    () => filterGraph(layoutNodes, fullEdges, selectedNodes),
    [layoutNodes, fullEdges, selectedNodes]
  );

  const handleNodeClick = (event, node) => {
    setSelector(`+${node.id}+`);
  };

  const handleZoomToExtents = () => {
    if (reactFlowInstance.current) {
      reactFlowInstance.current.fitView({
        padding: 0.2,
        duration: 500,
      });
    }
  };

  useEffect(() => {
    handleZoomToExtents();
  }, [selectedNodes]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="flex flex-row gap-2 mt-2 px-2 pt-2">
        <input
          type="text"
          value={selector}
          onChange={e => setSelector(e.target.value)}
          placeholder="e.g., 'test table+2, +3join_table'"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
        <Button onClick={() => setSelector('')}>Clear</Button>
        <Button onClick={handleZoomToExtents}>
          <MdOutlineZoomOutMap />
        </Button>
      </div>
      <ReactFlow
        nodes={filteredNodes.map(node => ({ ...node, type: 'objectPill' }))}
        edges={filteredEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onInit={instance => {
          reactFlowInstance.current = instance;
        }}
        minZoom={0.01}
        maxZoom={2}
        fitView
        style={{ flex: 1 }}
      />
    </div>
  );
};

export default Lineage;
