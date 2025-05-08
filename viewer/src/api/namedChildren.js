export const fetchNamedChildren = async () => {
  const response = await fetch('/api/project/named_children');
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};

export const writeNamedChildren = async namedChildren => {
  const response = await fetch('/api/project/write_changes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(namedChildren),
  });
  return response;
};
