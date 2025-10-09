import { getUrl } from '../contexts/URLContext';

export const listWorksheets = async () => {
  const response = await fetch(getUrl('worksheet'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch worksheets');
};

export const getWorksheet = async id => {
  const response = await fetch(getUrl('worksheetDetail', { id }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch worksheet');
};

export const createWorksheet = async data => {
  const response = await fetch(getUrl('worksheet'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (response.status === 201) {
    return await response.json();
  }
  throw new Error('Failed to create worksheet');
};

export const updateWorksheet = async (id, data) => {
  const response = await fetch(getUrl('worksheetDetail', { id }), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to update worksheet');
};

export const deleteWorksheet = async id => {
  const response = await fetch(getUrl('worksheetDetail', { id }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return true;
  }
  throw new Error('Failed to delete worksheet');
};

export const getSessionState = async () => {
  const response = await fetch(getUrl('worksheetSession'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch session state');
};

export const updateSessionState = async states => {
  const response = await fetch(getUrl('worksheetSession'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(states),
  });
  if (response.status === 200) {
    return true;
  }
  throw new Error('Failed to update session state');
};

// Cell API Functions
export const listCells = async worksheetId => {
  const response = await fetch(getUrl('worksheetCells', { id: worksheetId }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch cells');
};

export const getCell = async (worksheetId, cellId) => {
  const response = await fetch(getUrl('worksheetCellDetail', { worksheetId, cellId }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch cell');
};

export const createCell = async (worksheetId, data) => {
  const response = await fetch(getUrl('worksheetCells', { id: worksheetId }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (response.status === 201) {
    return await response.json();
  }
  throw new Error('Failed to create cell');
};

export const updateCell = async (worksheetId, cellId, data) => {
  const response = await fetch(getUrl('worksheetCellDetail', { worksheetId, cellId }), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to update cell');
};

export const deleteCell = async (worksheetId, cellId) => {
  const response = await fetch(getUrl('worksheetCellDetail', { worksheetId, cellId }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return true;
  }
  throw new Error('Failed to delete cell');
};

export const reorderCells = async (worksheetId, cellOrder) => {
  const response = await fetch(getUrl('worksheetCellsReorder', { id: worksheetId }), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ cell_order: cellOrder }),
  });
  if (response.status === 200) {
    return true;
  }
  throw new Error('Failed to reorder cells');
};

export const executeCell = async (worksheetId, cellId) => {
  const response = await fetch(getUrl('worksheetCellExecute', { worksheetId, cellId }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to execute cell');
};
