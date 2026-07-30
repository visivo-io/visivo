import { apiFetch } from './utils';

// POST for read: payload contains full working state (SQL, props, layout) that exceeds GET URL length limits.
export const fetchDiff = async (payload) => {
  const response = await apiFetch('/api/explorer/diff/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 200) {
    return await response.json();
  }
  return null;
};
