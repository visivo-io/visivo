// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import "jest-canvas-mock";
import { ResizeObserver } from "@juggle/resize-observer";

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
