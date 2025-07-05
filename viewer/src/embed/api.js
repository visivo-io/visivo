/**
 * Create headers with optional API key authentication
 */
function createHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  return headers;
}

/**
 * Fetch project data from the Django API
 */
export async function fetchProjectData(host, projectId, stageId, apiKey = null) {
  try {
    // First get the project details
    const projectUrl = `${host}/api/projects/${projectId}/`;
    const projectResponse = await fetch(projectUrl, {
      method: 'GET',
      headers: createHeaders(apiKey),
    });

    if (!projectResponse.ok) {
      throw new Error(`Failed to fetch project: ${projectResponse.status} ${projectResponse.statusText}`);
    }

    const projectData = await projectResponse.json();

    // Then get the stage details
    const stageUrl = `${host}/api/stages/${stageId}/`;
    const stageResponse = await fetch(stageUrl, {
      method: 'GET',
      headers: createHeaders(apiKey),
    });

    if (!stageResponse.ok) {
      throw new Error(`Failed to fetch stage: ${stageResponse.status} ${stageResponse.statusText}`);
    }

    const stageData = await stageResponse.json();

    // Combine project and stage data in the format expected by the viewer
    return {
      id: `${projectId}-${stageId}`,
      project_json: {
        dashboards: stageData.dashboards || [],
        charts: stageData.charts || [],
        tables: stageData.tables || [],
        rows: stageData.rows || [],
        markdowns: stageData.markdowns || [],
      },
      created_at: stageData.created_at || new Date().toISOString(),
      project: projectData,
      stage: stageData,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch project data: ${error.message}`);
    }
    throw new Error('Failed to fetch project data: Unknown error');
  }
}

/**
 * Fetch trace data for multiple traces from the Django API
 */
export async function fetchTracesData(host, projectId, stageId, traces, apiKey = null) {
  const traceData = {};

  // Fetch all traces in parallel
  const promises = traces.map(async (trace) => {
    const url = `${host}/api/traces/${trace.id || trace.name}/`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: createHeaders(apiKey),
      });

      if (!response.ok) {
        console.warn(`Failed to fetch trace data for ${trace.name}: ${response.status} ${response.statusText}`);
        return { name: trace.name, data: null };
      }

      const data = await response.json();
      return { name: trace.name, data };
    } catch (error) {
      console.warn(`Failed to fetch trace data for ${trace.name}:`, error);
      return { name: trace.name, data: null };
    }
  });

  const results = await Promise.all(promises);

  // Organize results by trace name
  results.forEach((result) => {
    if (result.data) {
      traceData[result.name] = result.data;
    }
  });

  return traceData;
}

/**
 * Fetch project by name (search through projects list)
 */
export async function fetchProjectByName(host, projectName, apiKey = null) {
  try {
    const url = `${host}/api/projects/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(apiKey),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
    }

    const projects = await response.json();
    const project = projects.find(p => p.name === projectName);
    
    if (!project) {
      throw new Error(`Project "${projectName}" not found`);
    }

    return project;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch project by name: ${error.message}`);
    }
    throw new Error('Failed to fetch project by name: Unknown error');
  }
}

/**
 * Fetch stage by name within a project
 */
export async function fetchStageByName(host, projectId, stageName, apiKey = null) {
  try {
    const url = `${host}/api/stages/`;
    const response = await fetch(url, {
      method: 'GET',
      headers: createHeaders(apiKey),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch stages: ${response.status} ${response.statusText}`);
    }

    const stages = await response.json();
    const stage = stages.find(s => s.name === stageName && s.project === projectId);
    
    if (!stage) {
      throw new Error(`Stage "${stageName}" not found in project`);
    }

    return stage;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch stage by name: ${error.message}`);
    }
    throw new Error('Failed to fetch stage by name: Unknown error');
  }
}