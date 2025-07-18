import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Onboarding from "./Onboarding";
import useStore from "../../stores/store";

// Mock navigate component before importing the module that uses it
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  Navigate: () => <div data-testid="navigate">Redirected</div>,
}));

jest.mock("../../stores/store");
jest.mock("./ProjectModal", () => ({ handleProjectNameSubmit, tempProjectName, setTempProjectName }) => (
  <div data-testid="project-modal">Project Modal</div>
));
jest.mock("../editors/CreateObjectModal", () => (props) =>
  props.isOpen ? <div data-testid="create-object-modal">Create Object Modal</div> : null
);
jest.mock("../common/Loading", () => () => <div data-testid="loading">Loading...</div>);
jest.mock("./FeatureCard", () => () => <div data-testid="feature-card">FeatureCard</div>);

beforeEach(() => {
  useStore.mockReturnValue(true); // isNewProject
});

afterEach(() => {
  jest.clearAllMocks();
});

test("renders onboarding content", async () => {
  render(<Onboarding />);
  expect(screen.getByText(/welcome to visivo/i)).toBeInTheDocument();
  expect(screen.getByText(/connect your data/i)).toBeInTheDocument();
  expect(screen.getByText(/import example dashboard/i)).toBeInTheDocument();
  expect(screen.getByTestId("feature-card")).toBeInTheDocument();
});

test("opens project name modal if no name set", () => {
  render(<Onboarding />);
  expect(screen.getByTestId("project-modal")).toBeInTheDocument();
});

test("opens CreateObjectModal on 'Add Data Source' click", async () => {
  render(<Onboarding />);
  const addButton = screen.getByText(/add data source/i);
  fireEvent.click(addButton);
  expect(await screen.findByTestId("create-object-modal")).toBeInTheDocument();
});

test("handles 'Import Example' click", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  );

  render(<Onboarding />);
  const importButton = screen.getByRole("button", { name: /import/i });
  fireEvent.click(importButton);

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith("/api/project/load_example", expect.anything());
  });
});


test("redirects if not a new project", () => {
  useStore.mockReturnValue(false); // Simulate existing project
  render(<Onboarding />);
  expect(screen.getByTestId("navigate")).toBeInTheDocument();
});

test("shows loading spinner while project status is undefined", () => {
  useStore.mockReturnValue(undefined);
  render(<Onboarding />);
  expect(screen.getByTestId("loading")).toBeInTheDocument();
});
