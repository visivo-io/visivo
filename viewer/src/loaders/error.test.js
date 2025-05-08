import * as errorApi from '../api/error';
import { loadError } from './error';
import { json } from 'react-router-dom';

describe('loadError when fetchError return null', () => {
  it('throws when returns null', async () => {
    const mockError = jest.spyOn(errorApi, 'fetchError').mockResolvedValue(null);

    await expect(loadError()).rejects.toEqual(
      json({ message: `Error not found.` }, { status: 404 })
    );

    expect(mockError).toHaveBeenCalledTimes(1);
  });
});
