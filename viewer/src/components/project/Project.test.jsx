import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Project from "./Project";

// Mock the Dashboard component since we're testing the Project component logic
jest.mock("./Dashboard", () => ({ project, dashboardName }) => (
  <div data-testid="dashboard-component">
    Dashboard: {dashboardName}
  </div>
));

jest.mock("../../stores/store", () => {
  const { createStore } = require("zustand/vanilla");
  const { useStore } = require("zustand");

  const store = createStore(() => ({
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
    default: (selector) => useStore(store, selector),
  };
});

describe("Project Component", () => {
  const mockProject = {
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
    },
  };

  const fetchTraces = jest.fn();

  test("renders dashboard component when dashboardName is provided", () => {
    render(
      <MemoryRouter>
        <Project
          project={mockProject}
          fetchTraces={fetchTraces}
          dashboardName="dashboard"
          dashboards={[{ name: "dashboard", path: "/dashboard" }]}
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
          fetchTraces={fetchTraces}
          dashboardName="dashboard"
          dashboards={[{ name: "dashboard", path: "/dashboard" }]}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });
});