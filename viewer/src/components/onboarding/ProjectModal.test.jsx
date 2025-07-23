import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import '@testing-library/jest-dom';
import ProjectModal from "./ProjectModal";

// Mocks
let handleSetProjectName;
let setTempProjectName;

beforeEach(() => {
  handleSetProjectName = jest.fn();
  setTempProjectName = jest.fn();

  // mock fetch
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    })
  );
});

afterEach(() => {
  jest.clearAllMocks();
});

test("renders the modal with input and button", () => {
  render(
    <ProjectModal
      handleSetProjectName={handleSetProjectName}
      tempProjectName=""
      setTempProjectName={setTempProjectName}
    />
  );

  expect(screen.getByText(/Name Your Project/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/e.g., Sales Analytics/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
});

test("calls setTempProjectName when input changes", () => {
  render(
    <ProjectModal
      handleSetProjectName={handleSetProjectName}
      tempProjectName=""
      setTempProjectName={setTempProjectName}
    />
  );

  const input = screen.getByPlaceholderText(/e.g., Sales Analytics/i);
  fireEvent.change(input, { target: { value: "Test Project" } });

  expect(setTempProjectName).toHaveBeenCalledWith("Test Project");
});

test("calls handleSetProjectName when Enter is pressed", async () => {
  render(
    <ProjectModal
      handleSetProjectName={handleSetProjectName}
      tempProjectName="Test Project"
      setTempProjectName={setTempProjectName}
    />
  );

  const input = screen.getByPlaceholderText(/e.g., Sales Analytics/i);
  fireEvent.keyUp(input, { key: 'Enter', code: 'Enter' });

  await waitFor(() => {
    expect(handleSetProjectName).toHaveBeenCalled();
  });
});

test("disables the Continue button when input is empty", () => {
  render(
    <ProjectModal
      handleSetProjectName={handleSetProjectName}
      tempProjectName=""
      setTempProjectName={setTempProjectName}
    />
  );

  const button = screen.getByRole("button", { name: /Continue/i });
  expect(button).toBeDisabled();
});

test("enables the Continue button when input is not empty", () => {
  render(
    <ProjectModal
      handleSetProjectName={handleSetProjectName}
      tempProjectName="My Project"
      setTempProjectName={setTempProjectName}
    />
  );

  const button = screen.getByRole("button", { name: /Continue/i });
  expect(button).toBeEnabled();
});

test("calls handleSetProjectName when button is clicked", async () => {
  render(
    <ProjectModal
      handleSetProjectName={handleSetProjectName}
      tempProjectName="Another Project"
      setTempProjectName={setTempProjectName}
    />
  );

  const button = screen.getByRole("button", { name: /Continue/i });
  fireEvent.click(button);

  await waitFor(() => {
    expect(handleSetProjectName).toHaveBeenCalled();
  });
});
