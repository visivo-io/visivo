// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import "jest-canvas-mock";
import { ResizeObserver } from "@juggle/resize-observer";
import {TextDecoder, TextEncoder} from "util";

// Make them globally available
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

// Mock Worker for DuckDB
global.Worker = class Worker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
  }
  
  postMessage(data) {
    // Mock implementation - do nothing
  }
  
  terminate() {
    // Mock implementation - do nothing
  }
};

if (!("ResizeObserver" in window)) {
  window.ResizeObserver = ResizeObserver;
  // Only use it when you have this trouble: https://github.com/wellyshen/react-cool-dimensions/issues/45
  // window.ResizeObserverEntry = ResizeObserverEntry;
}

// Mock DuckDB module
jest.mock("@duckdb/duckdb-wasm", () => ({
  __esModule: true,
  default: {
    selectBundle: jest.fn().mockResolvedValue({
      mainModule: "mock-main-module",
      mainWorker: "mock-main-worker"
    }),
  },
  AsyncDuckDB: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(),
    }),
    terminate: jest.fn().mockResolvedValue(),
  })),
  DuckDBDataProtocol: {
    BROWSER_FILEREADER: 'browser_filereader',
  },
  ConsoleLogger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
  })),
}));

if (!("ResizeObserver" in window)) {
  window.ResizeObserver = ResizeObserver;
  // Only use it when you have this trouble: https://github.com/wellyshen/react-cool-dimensions/issues/45
  // window.ResizeObserverEntry = ResizeObserverEntry;
}
window.URL.createObjectURL = function () {};

jest.mock("react-plotly.js", () => (props) => {
  return <div>Mock Plot</div>;
});

jest.mock("react-markdown", () => (props) => {
  return <div>{props.children}</div>;
});

global.structuredClone = (val) => {
  return JSON.parse(JSON.stringify(val));
};

const { Response, Headers, Request } = require("whatwg-fetch");

global.Response = Response;
global.Headers = Headers;
global.Request = Request;
