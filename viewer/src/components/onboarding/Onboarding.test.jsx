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
jest.mock("../common/Loading", () => ({ text }) => <div data-testid="loading">{text || "Loading..."}</div>);
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
  expect(screen.getByText(/or connect your data/i)).toBeInTheDocument();
  expect(screen.getByText(/jump right in and try an example/i)).toBeInTheDocument();
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
  const importButtons = screen.getAllByRole("button", { name: /import/i });
  fireEvent.click(importButtons[0]); // Click the first Import button

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith("/api/project/load_example/", expect.anything());
  });
  
  // Verify the loading text changes to "Preparing project ..."
  await waitFor(() => {
    expect(screen.getByText(/Preparing project/i)).toBeInTheDocument();
  });
});

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