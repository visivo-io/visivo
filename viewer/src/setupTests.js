// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import 'jest-canvas-mock';
import 'resize-observer-polyfill/dist/ResizeObserver.global';

// This polyfill ensures react-cool-dimensions works properly in tests
// Mock console.error to suppress react-cool-dimensions warnings in tests
const originalError = console.error;
console.error = (...args) => {
  if (args[0]?.includes?.("react-cool-dimensions: the browser doesn't support Resize Observer")) {
    return;
  }
  if (
    args[0]?.message?.includes?.('Not implemented: navigation') ||
    args[0]?.toString?.()?.includes?.('Not implemented: navigation')
  ) {
    return;
  }
  originalError(...args);
};

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
