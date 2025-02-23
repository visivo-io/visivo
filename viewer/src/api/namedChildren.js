export const fetchNamedChildren = async () => {
  const response = await fetch('/api/project/named_children');
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
}; 