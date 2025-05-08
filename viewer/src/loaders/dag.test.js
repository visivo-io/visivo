import * as dagApi from '../api/dag';
import { loadDag } from './dag';
import { json } from 'react-router-dom';

describe('loadDag when fetchDag return null', () => {
  it('throws when returns null', async () => {
    const mockDag = jest.spyOn(dagApi, 'fetchDag').mockResolvedValue(null);

    await expect(loadDag()).rejects.toEqual(json({ message: `Dag not found.` }, { status: 404 }));

    expect(mockDag).toHaveBeenCalledTimes(1);
  });
});
