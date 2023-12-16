import { render, screen } from '@testing-library/react';
import Project from './Project';
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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

test('renders dashboard names without dashboard name param', async () => {
  const project = getProject([{ width: 1, markdown: "First Markdown" }])
  render(<MemoryRouter initialEntries={['/dashboard']}>
    <Routes>
      <Route path="/:dashboardName?"
        element={<Project project={project} fetchTraces={fetchTraces} dashboardName={null} dashboards={[{ name: "dashboard", path: "/dashboard" }]} />}
      />)
    </Routes>
  </MemoryRouter>)

  const text = await screen.findByText(/dashboard/);
  expect(text).toBeInTheDocument();
})

test('renders dashboard with dashboard name param', async () => {
  const project = getProject([{ width: 1, markdown: "First Markdown" }])

  render(<MemoryRouter initialEntries={['/dashboard']}>
    <Routes>
      <Route path="/:dashboardName?"
        element={<Project project={project} fetchTraces={fetchTraces} dashboardName={'dashboard'} dashboards={[{ name: "dashboard", path: "/dashboard" }]} />}
      />)
    </Routes>
  </MemoryRouter>)

  const text = await screen.findByText(/First Markdown/);
  expect(text).toBeInTheDocument();
})