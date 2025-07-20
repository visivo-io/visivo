import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Project from "./Project";

// Mock Dashboard component
jest.mock("./Dashboard", () => ({ project, dashboardName }) => (
  <div data-testid="dashboard-component">Dashboard: {dashboardName}</div>
));
jest.mock("../../stores/store", () => {
  const { create } = require("zustand");

  const useStore = create(() => ({
    setScrollPosition: jest.fn(),
    scrollPositions: {},
    filteredDashboards: [],
    dashboardsByLevel: {
      Unassigned: [
        {
          name: "dashboard",
          rows: [
            {
              height: "medium",
              items: [
                {
                  width: 1,
                  markdown: "First Markdown",
                },
              ],
            },
          ],
        },
      ],
    },
    setDashboards: jest.fn(),
    setCurrentDashboardName: jest.fn(),
    filterDashboards: jest.fn(),
  }));

  return {
    __esModule: true,
    default: useStore,
  };
});

describe("Project Component", () => {
  const mockProject = {
    id: 1,
    project_json: {
      dashboards: [
        {
          name: "dashboard",
          rows: [
            {
              height: "medium",
              items: [
                {
                  width: 1,
                  markdown: "First Markdown",
                },
              ],
            },
          ],
        },
      ],
      defaults: {},
    },
  };

  const fetchTraces = jest.fn();

  test("renders dashboard component when dashboardName is provided", () => {
    render(
      <MemoryRouter>
        <Project
          project={mockProject}
          dashboardName="dashboard"
          fetchTraces={fetchTraces}
        />
      </MemoryRouter>
    );

    expect(screen.getByTestId("dashboard-component")).toBeInTheDocument();
    expect(screen.getByText("Dashboard: dashboard")).toBeInTheDocument();
  });

  test("renders dashboard name through Dashboard component", () => {
    render(
      <MemoryRouter>
        <Project
          project={mockProject}
          dashboardName="dashboard"
          fetchTraces={fetchTraces}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });
});
