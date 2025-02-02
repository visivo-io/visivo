export const executeQuery = async (query, projectId, sourceName) => {
  const response = await fetch(`/api/query/${projectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      source: sourceName
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to execute query');
  }

  const data = await response.json();
  return {
    columns: data.columns,
    data: data.rows
  };
}; 