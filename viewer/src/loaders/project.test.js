import * as projectApi from '../api/project';
import { loadProject } from '../loaders/project';
import { json } from 'react-router-dom';

describe('loadProject when fetchProject return null', () => {
  it('throws when returns null', async () => {
    const mockProject = jest.spyOn(projectApi, 'fetchProject').mockResolvedValue(null);

    await expect(loadProject()).rejects.toEqual(
      json({ message: `Project not found.` }, { status: 404 })
    );

    expect(mockProject).toHaveBeenCalledTimes(1);
  });
});
