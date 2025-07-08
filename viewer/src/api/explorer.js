export const fetchExplorer = async () => {
  const response = await fetch('/data/explorer.json');
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error('Failed to fetch explorer data');
    return null;
  }
};

export const fetchSourceMetadata = async () => {
  const response = await fetch('/api/project/sources_metadata');
  if (response.status === 200) {
    const data = await response.json();
    return data;
  } else {
    console.error('Failed to fetch source metadata');
    return null;
  }
};
