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
jest.mock("./ProjectModal", () => ({ handleSetProjectName, tempProjectName, setTempProjectName }) => (
  <div data-testid="project-modal">Project Modal</div>
));
jest.mock("../editors/CreateObjectModal", () => (props) =>
  props.isOpen ? <div data-testid="create-object-modal">Create Object Modal</div> : null
);
jest.mock("../common/Loading", () => () => <div data-testid="loading">Loading...</div>);
jest.mock("./FeatureCard", () => () => <div data-testid="feature-card">FeatureCard</div>);

// Mock the store values that the component uses
const mockStoreValues = {
  isNewProject: true,
  isOnBoardingLoading: false,
  project: {
    project_json: {
      project_dir: "/test/project"
    }
  }
};

beforeEach(() => {
  // Reset to default mock values before each test
  useStore.mockImplementation((selector) => {
    return selector(mockStoreValues);
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

test("renders onboarding content", async () => {
  render(<Onboarding />);
  expect(screen.getByText(/welcome to visivo/i)).toBeInTheDocument();
  expect(screen.getByText(/connect your data/i)).toBeInTheDocument();
  expect(screen.getByText(/or try an example/i)).toBeInTheDocument();
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
  jest.setTimeout(10000); // Increase test timeout
  
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  );
  
  // Mock window.location.reload
  delete window.location;
  window.location = { reload: jest.fn() };

  render(<Onboarding />);
  const importButtons = screen.getAllByRole("button", { name: /import/i });
  fireEvent.click(importButtons[0]); // Click the first Import button

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith("/api/project/load_example/", expect.anything());
  });
  
  // Wait for the reload to be called after timeout
  await waitFor(() => {
    expect(window.location.reload).toHaveBeenCalled();
  }, { timeout: 6000 });
}, 10000);

test("redirects if not a new project", () => {
  // Override the mock for this specific test
  useStore.mockImplementation((selector) => {
    return selector({
      ...mockStoreValues,
      isNewProject: false
    });
  });
  
  render(<Onboarding />);
  expect(screen.getByTestId("navigate")).toBeInTheDocument();
});

test("shows loading spinner while onboarding is loading", () => {
  // Override the mock for this specific test
  useStore.mockImplementation((selector) => {
    return selector({
      ...mockStoreValues,
      isOnBoardingLoading: true
    });
  });
  
  render(<Onboarding />);
  expect(screen.getByTestId("loading")).toBeInTheDocument();
});