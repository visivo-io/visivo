export const fetchSchema = async () => {
  const response = await fetch('/data/schema.json');
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};
