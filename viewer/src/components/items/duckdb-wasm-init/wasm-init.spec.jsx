import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import DuckDBInitializer from "./index.jsx";
import * as duckDBModule from ".";

// Mock the module that contains initializeDuckDB and getDuckDBStatus
jest.mock(".", () => ({
  initializeDuckDB: jest.fn(),
  getDuckDBStatus: jest.fn(),
}));

describe("DuckDBInitializer", () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows loading state correctly", async () => {
    // Set up the initial status to be in loading state
    duckDBModule.getDuckDBStatus.mockReturnValue({
      state: "loading",
      progress: 35,
      message: "Downloading WASM: 5MB / 15MB",
    });

    // Setup the initialization function to call the progress callback
    let progressCallback;
    duckDBModule.initializeDuckDB.mockImplementation((callback) => {
      progressCallback = callback;
      return new Promise((resolve) => {
        // Store the callback for later use in the test
        setTimeout(
          () =>
            resolve({
              /* mock DB instance */
            }),
          100
        );
      });
    });

    // Render the component
    render(<DuckDBInitializer onInitialized={jest.fn()} />);

    // Verify initial loading state is rendered
    expect(
      screen.getByText(/Downloading WASM: 5MB \/ 15MB/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Progress: 35%/i)).toBeInTheDocument();

    // Simulate a progress update
    await act(async () => {
      progressCallback({
        state: "loading",
        progress: 75,
        message: "Downloading WASM: 10MB / 15MB",
      });
    });

    // Verify updated loading state
    await waitFor(() => {
      expect(
        screen.getByText(/Downloading WASM: 10MB \/ 15MB/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Progress: 75%/i)).toBeInTheDocument();
    });
  });

  test("shows error state correctly", async () => {
    // Set up the initial status
    duckDBModule.getDuckDBStatus.mockReturnValue({
      state: "idle",
      progress: 0,
      message: "",
    });

    // Mock initialization function to throw an error
    duckDBModule.initializeDuckDB.mockRejectedValue(
      new Error("Failed to download DuckDB WASM module")
    );

    // Render the component
    render(<DuckDBInitializer onInitialized={jest.fn()} />);

    // Verify error message appears after the initialization fails
    await waitFor(() => {
      expect(
        screen.getByText(/Failed to download DuckDB WASM module/i)
      ).toBeInTheDocument();
    });
  });

  test("calls onInitialized when db is ready", async () => {
    // Set up the initial status
    duckDBModule.getDuckDBStatus.mockReturnValue({
      state: "idle",
      progress: 0,
      message: "",
    });

    // Mock DB instance
    const mockDBInstance = { query: jest.fn() };

    // Mock initialization to succeed
    duckDBModule.initializeDuckDB.mockResolvedValue(mockDBInstance);

    // Mock onInitialized callback
    const onInitializedMock = jest.fn();

    // Render the component
    render(<DuckDBInitializer onInitialized={onInitializedMock} />);

    // Verify onInitialized is called with the DB instance
    await waitFor(() => {
      expect(onInitializedMock).toHaveBeenCalledWith(mockDBInstance);
    });

    // Successful initialization should render nothing
    expect(screen.queryByText(/Initializing/i)).not.toBeInTheDocument();
  });

  test("updates status correctly from callback", async () => {
    // Set up the initial status
    duckDBModule.getDuckDBStatus.mockReturnValue({
      state: "idle",
      progress: 0,
      message: "",
    });

    // Mock DB instance
    const mockDBInstance = { query: jest.fn() };

    // Setup the initialization function to call the progress callback
    let statusCallback;
    duckDBModule.initializeDuckDB.mockImplementation((callback) => {
      statusCallback = callback;
      return new Promise((resolve) => {
        setTimeout(() => resolve(mockDBInstance), 100);
      });
    });

    // Render the component
    render(<DuckDBInitializer onInitialized={jest.fn()} />);

    // Simulate multiple progress updates
    await act(async () => {
      statusCallback({
        state: "loading",
        progress: 20,
        message: "Loading DuckDB modules...",
      });
    });

    expect(screen.getByText(/Loading DuckDB modules/i)).toBeInTheDocument();

    await act(async () => {
      statusCallback({
        state: "loading",
        progress: 50,
        message: "Downloading WASM: 5MB / 10MB",
      });
    });

    expect(
      screen.getByText(/Downloading WASM: 5MB \/ 10MB/i)
    ).toBeInTheDocument();

    await act(async () => {
      statusCallback({
        state: "success",
        progress: 100,
        message: "DuckDB ready!",
      });
    });

    // Once in success state, component should render nothing
    expect(screen.queryByText(/DuckDB ready/i)).not.toBeInTheDocument();
  });
});
