import { getUrl } from '../contexts/URLContext';
import { withProjectId } from './projectScope';
import { apiFetch } from './utils';

// POST for read: payload contains full working state (SQL, props, layout) that exceeds GET URL length limits.
//
// `projectId` scopes the comparison. Studio serves one project per server and
// ignores the param; cloud serves many and REQUIRES it — the endpoint 400s
// without one.
export const fetchDiff = async (payload, projectId = null) => {
  const url = withProjectId(getUrl('explorerDiff'), projectId);
  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 200) {
    return await response.json();
  }
  return null;
};
