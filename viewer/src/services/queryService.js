const executeQuery = async (query, projectId) => {
  try {
    console.log('Executing query:', { query, projectId });
    const response = await fetch(`/api/query/${projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    console.log('Query response status:', response.status);
    if (!response.ok) {
      const error = await response.json();
      console.error('Query error response:', error);
      throw new Error(error.message || 'Failed to execute query');
    }

    const data = await response.json();
    console.log('Query response data:', data);
    return {
      columns: data.columns || [],
      data: data.rows || []
    };
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  }
};

export { executeQuery }; 