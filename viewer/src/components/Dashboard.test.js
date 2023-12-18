import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';

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

const fetchTraces = () => {
  return []
}

test('renders dashboard chart', async () => {
  const project = getProject([{ width: 1, chart: { name: "chart_name", traces: [] } }])

  render(<Dashboard project={project} fetchTraces={fetchTraces} dashboardName={'dashboard'} />)

  await waitFor(() => {
    expect(screen.getByTestId('dashboard_dashboard')).toBeInTheDocument();
  });
})

test('renders dashboard markdown content', async () => {
  const project = getProject([{ width: 1, markdown: "First Markdown" }, { width: 2, markdown: "Wider Second Markdown" }])

  render(<Dashboard project={project} fetchTraces={fetchTraces} dashboardName={'dashboard'} />)
  const text = await screen.findByText(/First Markdown/);
  expect(text).toBeInTheDocument();
})

test('throws when dashboard not found', async () => {
  const project = getProject([{ width: 1, chart: { name: "chart_name", traces: [] } }])
  jest.spyOn(console, 'error').mockImplementation(() => null);

  expect(
    () => render(<Dashboard project={project} fetchTraces={fetchTraces} dashboardName={'noDashboard'} />)
  ).toThrow();
})