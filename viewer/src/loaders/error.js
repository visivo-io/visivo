import { throwError } from '../api/utils';
import { fetchError } from '../api/error';

export const loadError = async () => {
  const error = await fetchError();
  if (error) {
    return error;
  } else {
    throwError('Error not found.', 404);
  }
};
