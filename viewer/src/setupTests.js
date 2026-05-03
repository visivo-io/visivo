// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import 'jest-canvas-mock';
import 'resize-observer-polyfill/dist/ResizeObserver.global';

// Set up a default URL config for tests
import { setGlobalURLConfig, createURLConfig } from './contexts/URLContext';

import { TextDecoder, TextEncoder } from 'util';

// This polyfill ensures react-cool-dimensions works properly in tests
// Mock console.error to suppress react-cool-dimensions warnings in tests
const originalError = console.error;
const originalWarn = console.warn;

const isIgnoredErrorArg = (arg) =>
  arg?.includes?.("react-cool-dimensions: the browser doesn't support Resize Observer") ||
  arg?.message?.includes?.('Not implemented: navigation') ||
  arg?.toString?.()?.includes?.('Not implemented: navigation') ||
  // jsdom's XHR transport surfaces an AggregateError for any fetch that hits
  // the (fake) network — e.g. the capture-on-view thumbnail metadata probe.
  // Production code already swallows the rejection; this just silences the noise.
  arg?.toString?.() === 'Error: AggregateError';

// Track unexpected console output per test so we can fail the test in afterEach.
// Tests that *intentionally* exercise an error path should silence the expected
// log via jest.spyOn(console, 'error').mockImplementation(() => {}) (and likewise
// for console.warn) so it isn't counted here.
let consoleCalls = [];

console.error = (...args) => {
  if (isIgnoredErrorArg(args[0])) return;
  consoleCalls.push({ method: 'error', args });
  originalError(...args);
};

console.warn = (...args) => {
  consoleCalls.push({ method: 'warn', args });
  originalWarn(...args);
};

afterEach(() => {
  const calls = consoleCalls;
  consoleCalls = [];
  if (calls.length > 0) {
    const summary = calls
      .map(({ method, args }) => `console.${method}: ${args.map((a) => (a?.message || String(a))).join(' ')}`)
      .join('\n');
    throw new Error(
      `Test produced ${calls.length} unexpected console call(s):\n${summary}\n` +
        `If the call is expected, silence it via jest.spyOn(console, '${calls[0].method}').mockImplementation(() => {}).`
    );
  }
});

window.URL.createObjectURL = function () {};

jest.mock('react-plotly.js', () => props => {
  return <div>Mock Plot</div>;
});

jest.mock('react-markdown', () => props => {
  return <div>{props.children}</div>;
});

global.structuredClone = val => {
  return JSON.parse(JSON.stringify(val));
};

const { Response, Headers, Request } = require('whatwg-fetch');

global.Response = Response;
global.Headers = Headers;
global.Request = Request;

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder;
}

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder;
}

if (!global.Worker) {
  global.Worker = class {
    postMessage() {}
    terminate() {}
  };
}

// Mock IntersectionObserver for viewport-based loading tests
if (!global.IntersectionObserver) {
  global.IntersectionObserver = class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      // Immediately trigger intersection for all observed elements in tests
      // This ensures all items load without needing to simulate scrolling
      setTimeout(() => {
        this.callback([{ isIntersecting: true, target: { dataset: { rowIndex: '0' } } }]);
      }, 0);
    }
    unobserve() {}
    disconnect() {}
  };
}

// Mock React Query to prevent network requests in tests
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(() => ({
      data: [],
      isLoading: false,
      error: null,
      isError: false,
      refetch: jest.fn(),
    })),
  };
});

beforeEach(() => {
  // Set up a test URL config
  const testConfig = createURLConfig({ environment: 'server' });
  setGlobalURLConfig(testConfig);
});
