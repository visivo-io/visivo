import * as projectApi from '../api/project';
import { loadProject } from '../loaders/project';
import { json } from 'react-router-dom';

describe('loadProject', () => {
  it('throws 404 when the legacy blob endpoint returns null', async () => {
    const mockProject = jest.spyOn(projectApi, 'fetchProjectBlob').mockResolvedValue(null);

    await expect(loadProject()).rejects.toEqual(
      json({ message: `Project not found.` }, { status: 404 })
    );

    expect(mockProject).toHaveBeenCalledTimes(1);
  });
});
