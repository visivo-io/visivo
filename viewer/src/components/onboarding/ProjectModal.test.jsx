import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import '@testing-library/jest-dom';
import ProjectModal from "./ProjectModal";

let handleProjectNameSubmit;
let setTempProjectName;

beforeEach(() => {
  handleProjectNameSubmit = jest.fn();
  setTempProjectName = jest.fn();
});

test("renders the modal with input and button", () => {
  render(
    <ProjectModal
      handleProjectNameSubmit={handleProjectNameSubmit}
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
      handleProjectNameSubmit={handleProjectNameSubmit}
      tempProjectName=""
      setTempProjectName={setTempProjectName}
    />
  );

  const input = screen.getByPlaceholderText(/e.g., Sales Analytics/i);
  fireEvent.change(input, { target: { value: "Test Project" } });

  expect(setTempProjectName).toHaveBeenCalledWith("Test Project");
});

test("calls handleProjectNameSubmit when Enter is pressed", () => {
  render(
    <ProjectModal
      handleProjectNameSubmit={handleProjectNameSubmit}
      tempProjectName="Test Project"
      setTempProjectName={setTempProjectName}
    />
  );

  const input = screen.getByPlaceholderText(/e.g., Sales Analytics/i);
  fireEvent.keyUp(input, { key: 'Enter', code: 'Enter' });

  expect(handleProjectNameSubmit).toHaveBeenCalled();
});

test("disables the Continue button when input is empty", () => {
  render(
    <ProjectModal
      handleProjectNameSubmit={handleProjectNameSubmit}
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
      handleProjectNameSubmit={handleProjectNameSubmit}
      tempProjectName="My Project"
      setTempProjectName={setTempProjectName}
    />
  );

  const button = screen.getByRole("button", { name: /Continue/i });
  expect(button).toBeEnabled();
});

test("calls handleProjectNameSubmit when button is clicked", () => {
  render(
    <ProjectModal
      handleProjectNameSubmit={handleProjectNameSubmit}
      tempProjectName="Another Project"
      setTempProjectName={setTempProjectName}
    />
  );

  const button = screen.getByRole("button", { name: /Continue/i });
  fireEvent.click(button);

  expect(handleProjectNameSubmit).toHaveBeenCalled();
});
