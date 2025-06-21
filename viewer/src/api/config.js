export const deploymentRoot = window.deploymentRoot || '';

export const getApiUrl = (path) => {
  // Ensure path starts with a slash and deploymentRoot doesn't end with one for clean joining
  const cleanDeploymentRoot = deploymentRoot.endsWith('/')
    ? deploymentRoot.slice(0, -1)
    : deploymentRoot;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanDeploymentRoot}${cleanPath}`;
}; 