import { getUrl } from '../config/urls';

export const fetchNamedChildren = async () => {
  const response = await fetch(getUrl('namedChildren'));
  if (response.status === 200) {
    return await response.json();
  } else {
    return null;
  }
};

export const writeNamedChildren = async namedChildren => {
  const response = await fetch(getUrl('writeChanges'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(namedChildren),
  });
  return response;
};
