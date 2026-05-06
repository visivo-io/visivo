import * as projectApi from '../api/project';
import { loadProject, loadProjectMeta } from '../loaders/project';
import useStore from '../stores/store';
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

describe('loadProjectMeta', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    useStore.setState({ project: null });
  });

  it('stores only {id, name} on the project state — never the full blob', async () => {
    jest.spyOn(projectApi, 'fetchAllProjects').mockResolvedValue({
      projects: [
        {
          id: 'project-1',
          name: 'My Project',
          status: 'published',
          config: {
            // Intentionally heavy — verify nothing past id/name is persisted.
            defaults: { source_name: 'snowflake' },
          },
        },
      ],
    });
    const result = await loadProjectMeta();
    expect(result).toEqual({ id: 'project-1', name: 'My Project' });
    expect(useStore.getState().project).toEqual({
      id: 'project-1',
      name: 'My Project',
    });
  });

  it('picks the project matching ?project_id= when supplied', async () => {
    jest.spyOn(projectApi, 'fetchAllProjects').mockResolvedValue({
      projects: [
        { id: 'a', name: 'Project A' },
        { id: 'b', name: 'Project B' },
        { id: 'c', name: 'Project C' },
      ],
    });
    const request = { url: 'https://example.com/project-new?project_id=b' };
    const result = await loadProjectMeta({ request });
    expect(result).toEqual({ id: 'b', name: 'Project B' });
  });

  it('falls back to first project when ?project_id= does not match', async () => {
    jest.spyOn(projectApi, 'fetchAllProjects').mockResolvedValue({
      projects: [
        { id: 'a', name: 'Project A' },
        { id: 'b', name: 'Project B' },
      ],
    });
    const request = { url: 'https://example.com/project-new?project_id=missing' };
    const result = await loadProjectMeta({ request });
    expect(result).toEqual({ id: 'a', name: 'Project A' });
  });

  it('throws 404 when the projects list is empty', async () => {
    jest.spyOn(projectApi, 'fetchAllProjects').mockResolvedValue({ projects: [] });
    await expect(loadProjectMeta()).rejects.toEqual(
      json({ message: 'No projects available.' }, { status: 404 })
    );
  });

  it('throws 500 when the API call fails', async () => {
    jest.spyOn(projectApi, 'fetchAllProjects').mockRejectedValue(new Error('boom'));
    await expect(loadProjectMeta()).rejects.toEqual(
      json({ message: 'boom' }, { status: 500 })
    );
  });
});
