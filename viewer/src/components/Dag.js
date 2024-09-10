import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import * as dagreD3 from 'dagre-d3';
import { useLoaderData } from 'react-router-dom';
import { Container } from './styled/Container';

const Dag = () => {
    const svgRef = useRef(null);
    const project = useLoaderData();
    console.log(project)
    const dag = project.project_json.dag;

    console.log(dag)

    useEffect(() => {
        if (!dag || !svgRef.current) return;

        const svg = d3.select(svgRef.current);
        const g = new dagreD3.graphlib.Graph().setGraph({
            rankdir: 'LR',
            nodesep: 70,
            ranksep: 50,
            marginx: 20,
            marginy: 20
        });

        dag.nodes.forEach(node => {
            const typeColors = {
                'model': '#E6F3FF',     // Light Blue
                'trace': '#FFF0E6',     // Light Peach
                'chart': '#E6FFE6',     // Light Green
                'table': '#FFE6E6',     // Light Pink
                'selector': '#F0E6FF',  // Light Lavender
                'project': '#E6FFF0',   // Light Mint
                'source': '#FFE6F0',    // Light Rose
            };

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
                const details = [`path:${dagNode.path}`]
                if (node.label.indexOf(dagNode.path) === -1) {
                    g.setNode(nodeId, { ...node, label: `${newLabel}\n${details.join('\n')}` });
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

    return <Container><svg ref={svgRef} height={800}></svg></Container>;
};

export default Dag