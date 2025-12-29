import { getUrl } from '../contexts/URLContext';

export const fetchProject = async () => {
  const response = await fetch(getUrl('project'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};

/**
 * Fetch available environment variable names from the project's .env file.
 * Returns only variable names (not values) for security.
 *
 * @returns {Promise<{env_vars: string[], count: number} | null>}
 */
export const getEnvVars = async () => {
  try {
    const response = await fetch(getUrl('envVars'));
    if (response.status === 200) {
      return await response.json();
    } else {
      return { env_vars: [], count: 0 };
    }
  } catch (error) {
    console.error('Error fetching env vars:', error);
    return { env_vars: [], count: 0 };
  }
};
