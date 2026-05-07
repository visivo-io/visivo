import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { withProviders } from '../../utils/test-utils';

const getProject = items => {
  return {
    project_json: {
      dashboards: [
        {
          name: 'dashboard',
          rows: [
            {
              height: 'medium',
              items: items,
            },
          ],
        },
      ],
    },
  };
};

const renderDashboard = (project, dashboardName, path) => {
  return render(
    withProviders({
      children: <Dashboard project={project} dashboardName={dashboardName} />,
      initialPath: path,
    })
  );
};

test('renders dashboard chart', async () => {
  const project = getProject([
    { width: 1, chart: { name: 'chart_name', insights: [] } },
  ]);

  renderDashboard(project, 'dashboard', '/dashboard');

  await waitFor(() => {
    expect(screen.getByTestId('dashboard_dashboard')).toBeInTheDocument();
  });
});

test('renders dashboard markdown content', async () => {
  const project = getProject([
    { width: 1, markdown: { name: 'md1', content: 'First Markdown', align: 'left', justify: 'start' } },
    { width: 2, markdown: { name: 'md2', content: 'Wider Second Markdown', align: 'left', justify: 'start' } },
  ]);

  renderDashboard(project, 'dashboard', '/dashboard');

  const text = await screen.findByText(/First Markdown/);
  expect(text).toBeInTheDocument();
});

test('throws when dashboard not found', async () => {
  const project = getProject([{ width: 1, chart: { name: 'chart_name', insights: [] } }]);
  jest.spyOn(console, 'error').mockImplementation(() => null);

  expect(() => renderDashboard(project, 'noDashboard', '/dashboard')).toThrow();
});

test('renders nested item.rows row-container with sub-rows', async () => {
  const project = getProject([
    {
      width: 1,
      rows: [
        {
          height: 'small',
          items: [
            { width: 1, markdown: { name: 'sub-md-1', content: 'Top sub-row', align: 'left', justify: 'start' } },
          ],
        },
        {
          height: 'small',
          items: [
            { width: 1, markdown: { name: 'sub-md-2', content: 'Bottom sub-row', align: 'left', justify: 'start' } },
          ],
        },
      ],
    },
  ]);

  renderDashboard(project, 'dashboard', '/dashboard');

  expect(await screen.findByText(/Top sub-row/)).toBeInTheDocument();
  expect(await screen.findByText(/Bottom sub-row/)).toBeInTheDocument();

  const containers = await screen.findAllByTestId('dashboard-nested-rows');
  expect(containers.length).toBeGreaterThan(0);
  const subRows = await screen.findAllByTestId('dashboard-nested-subrow');
  expect(subRows.length).toBe(2);
});

test('renders deeply nested item.rows (3 levels)', async () => {
  const project = getProject([
    {
      width: 1,
      rows: [
        {
          height: 'medium',
          items: [
            {
              width: 1,
              rows: [
                {
                  height: 'small',
                  items: [
                    { width: 1, markdown: { name: 'leaf-md', content: 'Deep leaf', align: 'left', justify: 'start' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  renderDashboard(project, 'dashboard', '/dashboard');

  expect(await screen.findByText(/Deep leaf/)).toBeInTheDocument();
  const containers = await screen.findAllByTestId('dashboard-nested-rows');
  expect(containers.length).toBe(2);
});

test('renders mixed leaf + row-container siblings in same row', async () => {
  const project = getProject([
    {
      width: 2,
      markdown: { name: 'left-md', content: 'Left wide', align: 'left', justify: 'start' },
    },
    {
      width: 1,
      rows: [
        {
          height: 'small',
          items: [
            { width: 1, markdown: { name: 'right-top-md', content: 'Right top', align: 'left', justify: 'start' } },
          ],
        },
        {
          height: 'small',
          items: [
            { width: 1, markdown: { name: 'right-bottom-md', content: 'Right bottom', align: 'left', justify: 'start' } },
          ],
        },
      ],
    },
  ]);

  renderDashboard(project, 'dashboard', '/dashboard');

  expect(await screen.findByText(/Left wide/)).toBeInTheDocument();
  expect(await screen.findByText(/Right top/)).toBeInTheDocument();
  expect(await screen.findByText(/Right bottom/)).toBeInTheDocument();
});
