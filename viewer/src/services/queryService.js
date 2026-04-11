import { getUrl } from '../contexts/URLContext';

export const executeQuery = async (query, projectId, sourceName, worksheetId = null) => {
  const response = await fetch(getUrl('queryExecution', { projectId }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      source: sourceName,
      worksheet_id: worksheetId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to execute query');
  }

  const result = await response.json();
  return {
    columns: result.columns,
    data: result.rows,
  };
};

