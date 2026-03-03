import { getUrl } from '../contexts/URLContext';

export const listExplorations = async () => {
  const response = await fetch(getUrl('explorationsList'));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch explorations');
};

export const createExploration = async (name = 'Untitled') => {
  const response = await fetch(getUrl('explorationsList'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (response.status === 201) {
    return await response.json();
  }
  throw new Error('Failed to create exploration');
};

export const getExploration = async id => {
  const response = await fetch(getUrl('explorationDetail', { id }));
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to fetch exploration');
};

export const updateExploration = async (id, data) => {
  const response = await fetch(getUrl('explorationDetail', { id }), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (response.status === 200) {
    return await response.json();
  }
  throw new Error('Failed to update exploration');
};

export const deleteExploration = async id => {
  const response = await fetch(getUrl('explorationDetail', { id }), {
    method: 'DELETE',
  });
  if (response.status === 200) {
    return true;
  }
  throw new Error('Failed to delete exploration');
};
