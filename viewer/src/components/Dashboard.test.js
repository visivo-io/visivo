import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { withProviders } from '../utils/test-utils';

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

const project_with_json = {
  project_json: {
    selectors: [
      { name: 'selector1', type: "single", options: [{ name: 'option1' }, { name: 'option2' }] }
    ],
    dashboards: [{
      name: "dashboard",
      rows: [
        {
          name: "option1",
          items: [{ markdown: "Option 1 Content" }]
        },
        {
          name: "option2",
          items: [{ markdown: "Option 2 Content" }]
        }
      ]
    }]
  }
};

const renderDashboard = (project, dashboardName, path) => {
  return render(
    withProviders({
      children: <Dashboard project={project} dashboardName={dashboardName} />,
      initialPath: path
    })
  );
}

test('renders dashboard chart', async () => {
  const project = getProject([{ width: 1, chart: { name: "chart_name", traces: [] } }])

  renderDashboard(project, "dashboard", "/dashboard")

  await waitFor(() => {
    expect(screen.getByTestId('dashboard_dashboard')).toBeInTheDocument();
  });
})

test('renders dashboard markdown content', async () => {
  const project = getProject([{ width: 1, markdown: "First Markdown" }, { width: 2, markdown: "Wider Second Markdown" }])

  renderDashboard(project, "dashboard", "/dashboard")

  const text = await screen.findByText(/First Markdown/);
  expect(text).toBeInTheDocument();
})


describe('shows/hides row based on selector in URL', () => {
  test('shows option 1 if selected', async () => {
    renderDashboard(project_with_json, "dashboard", "/dashboard?selector1=option1");

    await waitFor(() => {
      expect(screen.getByText("Option 1 Content")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("Option 2 Content")).not.toBeInTheDocument();
    });
  });

  test('shows option 2 if selected', async () => {
    renderDashboard(project_with_json, "dashboard", "/dashboard?selector1=option2");

    await waitFor(() => {
      expect(screen.getByText("Option 2 Content")).toBeInTheDocument();
    });
    expect(screen.queryByText("Option 1 Content")).not.toBeInTheDocument();
  });

  test('show both options if both selected', async () => {
    renderDashboard(project_with_json, "dashboard", "/dashboard?selector1=option1,option2");

    await waitFor(() => {
      expect(screen.getByText("Option 1 Content")).toBeInTheDocument();
    });
    expect(screen.getByText("Option 2 Content")).toBeInTheDocument();
  });
});


test('throws when dashboard not found', async () => {
  const project = getProject([{ width: 1, chart: { name: "chart_name", traces: [] } }])
  jest.spyOn(console, 'error').mockImplementation(() => null);

  expect(
    () => renderDashboard(project, "noDashboard", "/dashboard")
  ).toThrow();
})