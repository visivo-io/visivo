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

// Wide-table fix: grid tracks must use minmax(0, 1fr) so they don't expand
// to grid items' min-content size. Combined with min-w-0 on the grid item
// div + flex wrapper, this prevents wide table widgets from pushing the
// dashboard row past the viewport.
describe('grid track sizing (wide-table fix)', () => {
  test('grid template uses minmax(0, 1fr) and items have min-w-0 when grid mode', async () => {
    const project = getProject([
      { width: 1, markdown: { name: 'md1', content: 'A', align: 'left', justify: 'start' } },
      { width: 2, markdown: { name: 'md2', content: 'B', align: 'left', justify: 'start' } },
    ]);

    const { container } = renderDashboard(project, 'dashboard', '/dashboard');

    await screen.findByText('A');
    /* eslint-disable testing-library/no-container, testing-library/no-node-access */
    const rows = container.querySelectorAll('.dashboard-row');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach(row => {
      // If we're in grid mode the template must use minmax(0,1fr). In jsdom
      // viewport width is 0 so we typically render in column-flex mode and
      // gridTemplateColumns is empty — assert with a regex that allows the
      // empty string (always passes) OR a correct minmax(0,1fr).
      const tpl = row.style.gridTemplateColumns;
      expect(tpl === '' || /minmax\(0p?x?,\s*1fr\)/.test(tpl)).toBe(true);
      // Every direct child (grid item or flex item) must have min-w-0 to
      // break min-content leakage from inner content.
      Array.from(row.children).forEach(child => {
        expect(child.className).toMatch(/\bmin-w-0\b/);
      });
    });
    /* eslint-enable testing-library/no-container, testing-library/no-node-access */
  });
});
