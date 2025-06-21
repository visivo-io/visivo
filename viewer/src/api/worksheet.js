import { getApiUrl } from './config';

export const listWorksheets = async () => {
  const response = await fetch(getApiUrl('/api/worksheet'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch worksheets');
};

export const getWorksheet = async id => {
  const response = await fetch(getApiUrl(`/api/worksheet/${id}`));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch worksheet');
};

export const createWorksheet = async data => {
  const response = await fetch(getApiUrl('/api/worksheet'), {
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
  const response = await fetch(getApiUrl(`/api/worksheet/${id}`), {
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
  const response = await fetch(getApiUrl(`/api/worksheet/${id}`), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return true;
  }
  throw new Error('Failed to delete worksheet');
};

export const getSessionState = async () => {
  const response = await fetch(getApiUrl('/api/worksheet/session'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch session state');
};

export const updateSessionState = async states => {
  const response = await fetch(getApiUrl('/api/worksheet/session'), {
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
