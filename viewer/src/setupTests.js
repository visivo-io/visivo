// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import 'jest-canvas-mock';
import { ResizeObserver, ResizeObserverEntry } from "@juggle/resize-observer";

if (!("ResizeObserver" in window)) {
  window.ResizeObserver = ResizeObserver;
  // Only use it when you have this trouble: https://github.com/wellyshen/react-cool-dimensions/issues/45
  // window.ResizeObserverEntry = ResizeObserverEntry;
}

window.URL.createObjectURL = function() {};

jest.mock("react-plotly.js", () => (props) => {
    return <>Mock Plot</>
})

jest.mock("react-markdown", () => (props) => {
    return <>{props.children}</>
})

beforeAll(() => {
    global.ResizeObserver = ResizeObserver;
    global.ResizeObserverEntry = ResizeObserverEntry;
});