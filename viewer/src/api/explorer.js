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
