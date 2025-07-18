import { json } from 'react-router';

export const throwError = (message, status) => {
  throw json({ message: message }, { status: status });
};
