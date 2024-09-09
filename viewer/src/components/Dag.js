import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
const Dag = ({ dag }) => {
    const svgRef = useRef(null);

    useEffect(() => {
        if (!dag || !svgRef.current) return;

        const svg = d3.select(svgRef.current);
        const g = new dagreD3.graphlib.Graph().setGraph({
            rankdir: 'TB',
            nodesep: 70,
            ranksep: 50,
            marginx: 20,
            marginy: 20
        });

        dag.nodes.forEach(node => {
            g.setNode(node.id, {
                label: node.name || node.type,
                shape: "rect",
                paddingLeft: 10,
                paddingRight: 10,
                paddingTop: 5,
                paddingBottom: 5
            });
        });

        dag.edges.forEach(edge => {
            g.setEdge(edge.source, edge.target, {
                label: "",
                curve: d3.curveBasis  // This will make the edges curved
            });
        });

        svg.selectAll('*').remove();

        const svgGroup = svg.append('g');
        const render = new dagreD3.render();

        render(svgGroup, g);

        // Add click event to nodes
        svgGroup.selectAll("g.node")
            .on("click", function (event, nodeId) {
                const node = g.node(nodeId);
                const dagNode = dag.nodes.find(n => n.id === nodeId);
                const newLabel = dagNode.name || dagNode.type;
                if (node.label.indexOf(dagNode.path) === -1) {
                    g.setNode(nodeId, { ...node, label: `${newLabel}\n${dagNode.path}` });
                } else {
                    g.setNode(nodeId, { ...node, label: newLabel });
                }
                render(svgGroup, g);
            });

        // Calculate scale to fit the graph within the SVG
        const svgWidth = svg.node().getBoundingClientRect().width;
        const svgHeight = svg.node().getBoundingClientRect().height;
        const graphWidth = g.graph().width;
        const graphHeight = g.graph().height;
        const scale = Math.min(svgWidth / graphWidth, svgHeight / graphHeight) * 0.9; // 0.9 to add some padding

        // Center the graph
        const xCenterOffset = (svgWidth - graphWidth * scale) / 2;
        const yCenterOffset = (svgHeight - graphHeight * scale) / 2;

        svgGroup.attr('transform', `translate(${xCenterOffset}, ${yCenterOffset}) scale(${scale})`);

        // Add zoom behavior
        const zoom = d3.zoom().on('zoom', (event) => {
            svgGroup.attr('transform', event.transform);
        });
        svg.call(zoom);

        // Initial zoom to fit
        svg.call(zoom.transform, d3.zoomIdentity.translate(xCenterOffset, yCenterOffset).scale(scale));
    }, [dag]);

    return <svg ref={svgRef} height={600}></svg>;
};

export default Dag