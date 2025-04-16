import dagre from 'dagre';

// Build nodes and edges from namedChildren
export const buildGraph = (namedChildren) => {
  const nodes = Object.keys(namedChildren).map((name) => ({
    id: name,
    data: { name },
  }));
  const edges = [];
  Object.entries(namedChildren).forEach(([name, config]) => {
    const children = config.direct_children || [];
    children.forEach((child) => {
      edges.push({
        id: `${name}-${child}`,
        source: name,
        target: child,
      });
    });
  });
  return { nodes, edges };
};

// Get all descendants of a node (including itself)
export const getDescendants = (startNode, namedChildren) => {
  const descendants = new Set();
  const queue = [startNode];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!descendants.has(node)) {
      descendants.add(node);
      const children = namedChildren[node]?.direct_children || [];
      queue.push(...children);
    }
  }
  return descendants;
};

// Get all ancestors of a node (including itself)
export const getAncestors = (startNode, namedChildren) => {
  const ancestors = new Set();
  const queue = [startNode];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!ancestors.has(node)) {
      ancestors.add(node);
      const parents = namedChildren[node]?.direct_parents || [];
      queue.push(...parents);
    }
  }
  return ancestors;
};

// Get descendants up to N generations
// Get ancestors up to N generations
export const getAncestorsLimited = (startNode, namedChildren, generations) => {
    const ancestors = new Set();
    const queue = [{ node: startNode, depth: 0 }];
    while (queue.length > 0) {
      const { node, depth } = queue.shift();
      if (depth > generations) break;
      if (!ancestors.has(node)) {
        ancestors.add(node);
        if (depth < generations) {
          const parents = namedChildren[node]?.direct_parents || [];
          queue.push(...parents.map((parent) => ({ node: parent, depth: depth + 1 })));
        }
      }
    }
    return ancestors;
  };
  
  // Get descendants up to N generations
  export const getDescendantsLimited = (startNode, namedChildren, generations) => {
    const descendants = new Set();
    const queue = [{ node: startNode, depth: 0 }];
    while (queue.length > 0) {
      const { node, depth } = queue.shift();
      if (depth > generations) break;
      if (!descendants.has(node)) {
        descendants.add(node);
        if (depth < generations) {
          const children = namedChildren[node]?.direct_children || [];
          queue.push(...children.map((child) => ({ node: child, depth: depth + 1 })));
        }
      }
    }
    return descendants;
  };


// Parse the selector according to the clarified syntax
export const parseSelector = (selector, namedChildren) => {
    if (!selector.trim()) {
      return new Set(Object.keys(namedChildren));
    }
  
    const terms = selector.split(',').map((term) => term.trim());
    let selected = new Set();
  
    terms.forEach((term) => {
      // eslint-disable-next-line no-useless-escape
      const match = term.match(/^(?:(\d*)(\+))?([^\+]+)(?:(\+)(\d*)?)?$/);
      if (match && namedChildren[match[3]]) {
        const ancestorDigits = match[1]; // e.g., '2' in '2+join_table'
        const hasAncestorPlus = match[2] === '+';
        const node = match[3];           // e.g., 'join_table'
        const hasDescendantPlus = match[4] === '+';
        const descendantDigits = match[5]; // e.g., '3' in 'join_table+3'
  
        // Determine ancestor generations
        let ancestorGen = 0;
        if (hasAncestorPlus) {
          ancestorGen = (ancestorDigits === '' || ancestorDigits === undefined) 
            ? Infinity 
            : parseInt(ancestorDigits, 10);
        }
  
        // Determine descendant generations
        let descendantGen = 0;
        if (hasDescendantPlus) {
          descendantGen = (descendantDigits === '' || descendantDigits === undefined) 
            ? Infinity 
            : parseInt(descendantDigits, 10);
        }
  
        // Collect ancestors if specified
        let ancestorsSet = new Set();
        if (ancestorGen > 0) {
          ancestorsSet = ancestorGen === Infinity
            ? getAncestors(node, namedChildren)
            : getAncestorsLimited(node, namedChildren, ancestorGen);
        }
  
        // Collect descendants if specified
        let descendantsSet = new Set();
        if (descendantGen > 0) {
          descendantsSet = descendantGen === Infinity
            ? getDescendants(node, namedChildren)
            : getDescendantsLimited(node, namedChildren, descendantGen);
        }
  
        // Add the node itself and its ancestors/descendants
        selected.add(node);
        ancestorsSet.forEach((n) => selected.add(n));
        descendantsSet.forEach((n) => selected.add(n));
      } else if (namedChildren[term]) {
        selected.add(term); // Handle plain node names
      }
    });
  
    return selected;
  };


export const filterGraph = (nodes, edges, selectedNodes) => {
    const filteredNodes = nodes.filter((node) => selectedNodes.has(node.id));
    const filteredEdges = edges.filter(
        (edge) => selectedNodes.has(edge.source) && selectedNodes.has(edge.target)
    );
    return { nodes: filteredNodes, edges: filteredEdges };
};
// Compute node positions using dagre
export const computeLayout = (nodes, edges) => {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR' }); // Left-to-right layout
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((node) => {
    graph.setNode(node.id, { width: 300, height: 20 }); // Adjust based on ObjectPill size
  });
  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });
  dagre.layout(graph);
  return nodes.map((node) => {
    const nodeWithPosition = graph.node(node.id);
    return {
      ...node,
      position: { x: nodeWithPosition.x, y: nodeWithPosition.y },
    };
  });
};
