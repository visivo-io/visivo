import React, { useState, useEffect } from 'react';
import { 
  fetchProjectData, 
  fetchTracesData, 
  fetchProjectByName, 
  fetchStageByName 
} from './api';
import { EmbedProvider } from './EmbedProvider';
import Dashboard from '../components/project/Dashboard';
import Item from '../components/items/Item';

/**
 * Visivo embeddable component for displaying dashboards, charts, tables, and markdown
 */
export const Visivo = ({
  project,
  stage,
  item,
  host = 'https://api.visivo.io',
  apiKey,
  className,
  style,
  loading,
  error,
  onLoad,
  onError
}) => {
  const [projectData, setProjectData] = useState(null);
  const [traceData, setTraceData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setIsLoading(true);
        setErrorState(null);

        // First resolve project name to ID
        const projectData = await fetchProjectByName(host, project, apiKey);
        if (!isMounted) return;

        // Then resolve stage name to ID
        const stageData = await fetchStageByName(host, projectData.id, stage, apiKey);
        if (!isMounted) return;

        // Fetch combined project and stage data
        const projData = await fetchProjectData(host, projectData.id, stageData.id, apiKey);
        
        if (!isMounted) return;
        
        setProjectData(projData);

        // Find the requested item
        const foundItem = findItemInProject(projData, item);
        if (!foundItem) {
          throw new Error(`Item "${item}" not found in project "${project}"`);
        }

        // Collect all traces needed for this item
        const traces = collectTracesFromItem(foundItem);
        
        // Fetch trace data
        let tracesDataResult = {};
        if (traces.length > 0) {
          tracesDataResult = await fetchTracesData(host, projectData.id, stageData.id, traces, apiKey);
        }

        if (!isMounted) return;
        
        setTraceData(tracesDataResult);
        setIsLoading(false);
        
        if (onLoad) {
          onLoad({ project: projData, traces: tracesDataResult });
        }
      } catch (err) {
        if (!isMounted) return;
        
        const error = err instanceof Error ? err : new Error(String(err));
        setErrorState(error);
        setIsLoading(false);
        
        if (onError) {
          onError(error);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [project, stage, item, host, apiKey, onLoad, onError]);

  // Show loading state
  if (isLoading) {
    if (loading) {
      return <>{loading}</>;
    }
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: '20px'
      }}>
        <div style={{
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #3498db',
          borderRadius: '50%',
          width: '30px',
          height: '30px',
          animation: 'spin 1s linear infinite'
        }} />
        <span style={{ marginLeft: '10px' }}>Loading {item}...</span>
      </div>
    );
  }

  // Show error state
  if (errorState) {
    if (error) {
      return <>{error}</>;
    }
    return (
      <div style={{ 
        padding: '16px', 
        border: '1px solid #f56565', 
        borderRadius: '4px', 
        backgroundColor: '#fed7d7',
        color: '#742a2a'
      }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>
          Error loading {item}
        </h3>
        <p style={{ margin: '0', fontSize: '12px' }}>
          {errorState.message}
        </p>
      </div>
    );
  }

  // Render the item
  if (!projectData) {
    return null;
  }

  const foundItem = findItemInProject(projectData, item);
  if (!foundItem) {
    return (
      <div style={{ padding: '16px', color: '#e53e3e' }}>
        Item "{item}" not found in project
      </div>
    );
  }

  const containerStyle = {
    width: '100%',
    ...style
  };

  return (
    <EmbedProvider projectId={projectData.id} traceData={traceData} useMemoryRouter={true}>
      <div className={className} style={containerStyle}>
        {renderItem(foundItem, traceData, projectData)}
      </div>
    </EmbedProvider>
  );
};

/**
 * Find an item by name in the project data
 */
function findItemInProject(projectData, itemName) {
  const { project_json } = projectData;
  
  // Search in dashboards
  if (project_json.dashboards) {
    const dashboard = project_json.dashboards.find(d => d.name === itemName);
    if (dashboard) return { type: 'dashboard', data: dashboard };
  }
  
  // Search in charts
  if (project_json.charts) {
    const chart = project_json.charts.find(c => c.name === itemName);
    if (chart) return { type: 'chart', data: chart };
  }
  
  // Search in tables
  if (project_json.tables) {
    const table = project_json.tables.find(t => t.name === itemName);
    if (table) return { type: 'table', data: table };
  }
  
  // Search in markdowns
  if (project_json.markdowns) {
    const markdown = project_json.markdowns.find(m => m.name === itemName);
    if (markdown) return { type: 'markdown', data: markdown };
  }
  
  return null;
}

/**
 * Collect all traces from an item (recursively for dashboards)
 */
function collectTracesFromItem(item) {
  const traces = [];
  
  if (item.type === 'dashboard' && item.data.rows) {
    item.data.rows.forEach((row) => {
      if (row.items) {
        row.items.forEach((subItem) => {
          traces.push(...collectTracesFromAnyItem(subItem));
        });
      }
    });
  } else if ((item.type === 'chart' || item.type === 'table') && item.data.traces) {
    traces.push(...item.data.traces.map((t) => ({ name: t.name })));
  }
  
  return traces;
}

/**
 * Collect traces from any item type
 */
function collectTracesFromAnyItem(item) {
  const traces = [];
  
  if (item.chart && item.chart.traces) {
    traces.push(...item.chart.traces.map((t) => ({ name: t.name })));
  }
  
  if (item.table && item.table.traces) {
    traces.push(...item.table.traces.map((t) => ({ name: t.name })));
  }
  
  return traces;
}

/**
 * Render an item based on its type using existing viewer components
 */
function renderItem(item, traceData, projectData) {
  const project = {
    id: projectData.id,
    project_json: projectData.project_json
  };

  switch (item.type) {
    case 'dashboard':
      return (
        <Dashboard
          project={project}
          dashboardName={item.data.name}
        />
      );
    case 'chart':
    case 'table':
    case 'markdown':
      return (
        <Item
          item={{ [item.type]: item.data }}
          project={project}
          height={400}
          width={600}
          itemWidth={1}
          keyPrefix="embed"
        />
      );
    default:
      return (
        <div style={{ padding: '16px', color: '#e53e3e' }}>
          Unknown item type: {item.type}
        </div>
      );
  }
}