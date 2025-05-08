import React, { useState, useMemo } from "react";
import ReactFlow from "react-flow-renderer";
import useStore from "../../stores/store"; // Adjust path to your store
import ObjectPillNode from "./ObjectPillNode";
import {
  buildGraph,
  parseSelector,
  filterGraph,
  computeLayout,
} from "./graphUtils";

const nodeTypes = { objectPill: ObjectPillNode };

const Lineage = ({ defaultSelector = "" }) => {
  const namedChildren = useStore((state) => state.namedChildren);
  const [selector, setSelector] = useState(defaultSelector);

  const { nodes: fullNodes, edges: fullEdges } = useMemo(
    () => buildGraph(namedChildren),
    [namedChildren]
  );

  const layoutNodes = useMemo(() => computeLayout(fullNodes, fullEdges), [fullNodes, fullEdges]);

  const selectedNodes = useMemo(
    () => parseSelector(selector, namedChildren),
    [selector, namedChildren]
  );

  const { nodes: filteredNodes, edges: filteredEdges } = useMemo(
    () => filterGraph(layoutNodes, fullEdges, selectedNodes),
    [layoutNodes, fullEdges, selectedNodes]
  );

  return (
    <div style={{ height: "80vh", display: "flex", flexDirection: "column" }}>
      <input
        type="text"
        value={selector}
        onChange={e => setSelector(e.target.value)}
        placeholder="e.g., 'test table+2, +3join_table'"
        className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg"
      />
      <ReactFlow
        nodes={filteredNodes.map((node) => ({ ...node, type: "objectPill" }))}
        edges={filteredEdges}
        nodeTypes={nodeTypes}
        fitView
        style={{ flex: 1 }}
      />
    </div>
  );
};

export default Lineage;
