import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import { useLoaderData } from 'react-router-dom';
import { Container } from './styled/Container';

const typeColors = {
    'model': '#E6F3FF',     // Light Blue
    'trace': '#FFF0E6',     // Light Peach
    'chart': '#E6FFE6',     // Light Green
    'table': '#FFE6E6',     // Light Pink
    'selector': '#F0E6FF',  // Light Lavender
    'project': '#E6FFF0',   // Light Mint
    'source': '#FFE6F0',    // Light Rose
};

const filterDag = (dag, nodeName, before, after) => {
    if (!nodeName) return dag;

    const nodeIndex = dag.nodes.findIndex(node => node.name === nodeName);
    if (nodeIndex === -1) return dag;

    const targetNode = dag.nodes[nodeIndex];
    const nodesToInclude = new Set([targetNode.id]);

    // Function to recursively add nodes based on edge connections
    const addConnectedNodes = (nodeId, depth, direction) => {
        if (depth === 0) return;

        const relevantEdges = dag.edges.filter(edge =>
            direction === 'backward' ? edge.target === nodeId : edge.source === nodeId
        );

        relevantEdges.forEach(edge => {
            const connectedNodeId = direction === 'backward' ? edge.source : edge.target;
            if (!nodesToInclude.has(connectedNodeId)) {
                nodesToInclude.add(connectedNodeId);
                addConnectedNodes(connectedNodeId, depth - 1, direction);
            }
        });
    };

    // Add nodes before
    addConnectedNodes(targetNode.id, before, 'backward');

    // Add nodes after
    addConnectedNodes(targetNode.id, after, 'forward');

    const filteredNodes = dag.nodes.filter(node => nodesToInclude.has(node.id));
    const filteredEdges = dag.edges.filter(edge =>
        nodesToInclude.has(edge.source) && nodesToInclude.has(edge.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
};

const Dag = () => {
    const svgRef = useRef(null);
    const dagModel = useLoaderData();
    const [state, setState] = useState({
        nodeName: null,
        before: 0,
        after: 0,
    });

    const dag = useMemo(() => 
        filterDag(dagModel, state.nodeName, state.before, state.after),
        [dagModel, state.nodeName, state.before, state.after]
    );

    useEffect(() => {
        if (!svgRef.current || !dag) return;

        const svg = d3.select(svgRef.current);
        const g = new dagreD3.graphlib.Graph().setGraph({
            rankdir: 'LR',
            nodesep: 20,
            ranksep: 30,
            marginx: 20,
            marginy: 20
        });

        svg.selectAll('*').remove();

        dag.nodes.forEach(node => {
            g.setNode(node.id, {
                label: node.name || node.type,
                shape: "rect",
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 5,
                paddingBottom: 5,
                style: `fill: ${typeColors[node.type.toLowerCase()] || '#FFFFFF'}`
            });
        });

        dag.edges.forEach(edge => {
            g.setEdge(edge.source, edge.target, {
                label: "",
                curve: d3.curveBasis
            });
        });

        const svgGroup = svg.append('g');
        const render = new dagreD3.render();

        render(svgGroup, g);

        svgGroup.selectAll("g.node")
            .on("click", function (event, nodeId) {
                const node = g.node(nodeId);
                const dagNode = dag.nodes.find(n => n.id === nodeId);
                const newLabel = dagNode.name || dagNode.type;
                const details = [`path:${dagNode.path}`]
                if (node.label.indexOf(dagNode.path) === -1) {
                    g.setNode(nodeId, { ...node, label: `${newLabel}\n${details.join('\n')}` });
                } else {
                    g.setNode(nodeId, { ...node, label: newLabel });
                }
                render(svgGroup, g);
            });

        const svgWidth = svg.node().getBoundingClientRect().width;
        const svgHeight = svg.node().getBoundingClientRect().height;
        const graphWidth = g.graph().width;
        const graphHeight = g.graph().height;
        const scale = Math.min(svgWidth / graphWidth, svgHeight / graphHeight) * 0.9;

        const xCenterOffset = (svgWidth - graphWidth * scale) / 2;
        const yCenterOffset = (svgHeight - graphHeight * scale) / 2;

        svgGroup.attr('transform', `translate(${xCenterOffset}, ${yCenterOffset}) scale(${scale})`);

        const zoom = d3.zoom().on('zoom', (event) => {
            svgGroup.attr('transform', event.transform);
        });
        svg.call(zoom);

        svg.call(zoom.transform, d3.zoomIdentity.translate(xCenterOffset, yCenterOffset).scale(scale));
    }, [dag]);

    return (
        <Container>
            <div className="mb-4 flex space-x-4">
                <input
                    type="text"
                    placeholder="Filter by node name"
                    className="px-2 py-1 border rounded mr-2"
                    onChange={(e) => setState(prevState => ({ ...prevState, nodeName: e.target.value }))}
                />
                <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Before"
                    className="px-2 py-1 border rounded mr-2"
                    onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        setState(prevState => ({ ...prevState, before: value }));
                    }}
                />
                <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="After"
                    className="px-2 py-1 border rounded"
                    onChange={(e) => {
                        const value = Math.max(0, parseInt(e.target.value) || 0);
                        setState(prevState => ({ ...prevState, after: value }));
                    }}
                />
            </div>
            <svg ref={svgRef} height={800} width="100%"></svg>
        </Container>
    );
};

export default Dag;