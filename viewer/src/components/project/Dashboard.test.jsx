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
