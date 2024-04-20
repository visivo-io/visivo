import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { renderWithProviders } from '../utils/test-utils';

const getProject = (items) => {
  return {
    project_json: {
      dashboards: [{
        name: "dashboard", rows: [{
          height: "medium", items: items
        }]
      }]
    }
  }
};

test('renders dashboard chart', async () => {
  const project = getProject([{ width: 1, chart: { name: "chart_name", traces: [] } }])

  renderWithProviders(<Dashboard project={project} dashboardName={'dashboard'} />)

  await waitFor(() => {
    expect(screen.getByTestId('dashboard_dashboard')).toBeInTheDocument();
  });
})

test('renders dashboard markdown content', async () => {
  const project = getProject([{ width: 1, markdown: "First Markdown" }, { width: 2, markdown: "Wider Second Markdown" }])

  render(<Dashboard project={project} dashboardName={'dashboard'} />)
  const text = await screen.findByText(/First Markdown/);
  expect(text).toBeInTheDocument();
})

test('throws when dashboard not found', async () => {
  const project = getProject([{ width: 1, chart: { name: "chart_name", traces: [] } }])
  jest.spyOn(console, 'error').mockImplementation(() => null);

  expect(
    () => render(<Dashboard project={project} dashboardName={'noDashboard'} />)
  ).toThrow();
})