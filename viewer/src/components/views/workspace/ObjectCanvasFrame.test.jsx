/**
 * ObjectCanvasFrame (VIS-1001) — the shared per-object canvas shell.
 */
import React from 'react';
import { render as rtlRender, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ObjectCanvasFrame from './ObjectCanvasFrame';
import useStore from '../../../stores/store';
import { isAvailable } from '../../../contexts/URLContext';

const RouterWrapper = ({ children }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);
const render = ui => rtlRender(ui, { wrapper: RouterWrapper });

jest.mock('../lineage/LineageCanvas', () => ({
  __esModule: true,
  default: () => <div data-testid="lineage-canvas-mock" />,
}));
jest.mock('./ChartPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="chart-preview-mock" />,
}));
jest.mock('./ModelPreview', () => ({
  __esModule: true,
  default: () => <div data-testid="model-preview-mock" />,
}));
jest.mock('../../../contexts/URLContext', () => {
  const actual = jest.requireActual('../../../contexts/URLContext');
  return { ...actual, isAvailable: jest.fn(() => true) };
});

beforeEach(() => {
  isAvailable.mockReturnValue(true);
  act(() => {
    useStore.setState({ workspaceLensIntent: null, clearWorkspaceLensIntent: jest.fn() });
  });
});

const frameFor = (type, name = 'thing') => (
  <ObjectCanvasFrame activeObject={{ type, name }} projectId="p1" />
);

describe('ObjectCanvasFrame', () => {
  test('renders the SubBar with the object name + singular label + lens picker', async () => {
    render(frameFor('chart', 'revenue'));
    expect(screen.getByTestId('workspace-subbar-chart')).toBeInTheDocument();
    expect(screen.getByText('revenue')).toBeInTheDocument();
    expect(screen.getByText('Chart')).toBeInTheDocument(); // singularLabel
    expect(screen.getByTestId('workspace-lens-picker-option-preview')).toHaveTextContent('Canvas');
    expect(screen.getByTestId('workspace-lens-picker-option-lineage')).toBeInTheDocument();
    // Flush the lazy body so its suspension resolves inside act().
    await screen.findByTestId('chart-preview-mock');
  });

  test('a read-only lens shows the read-only pill (not a dirty indicator)', async () => {
    render(frameFor('chart'));
    expect(screen.getByTestId('canvas-readonly-pill')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-dirty-indicator')).not.toBeInTheDocument();
    await screen.findByTestId('chart-preview-mock');
  });

  test('mounts the lazy body in the canvas lens', async () => {
    render(frameFor('chart'));
    expect(screen.getByTestId('workspace-middle-chart-preview')).toBeInTheDocument();
    expect(await screen.findByTestId('chart-preview-mock')).toBeInTheDocument();
  });

  test('the lineage lens mounts LineageCanvas', async () => {
    render(frameFor('chart'));
    await screen.findByTestId('chart-preview-mock'); // settle the default preview first
    fireEvent.click(screen.getByTestId('workspace-lens-picker-option-lineage'));
    expect(screen.getByTestId('workspace-middle-chart-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
    // The universal Lineage lens is its own read-only DAG — no canvas pill.
    expect(screen.queryByTestId('canvas-readonly-pill')).not.toBeInTheDocument();
  });

  test('a serve-only canvas degrades to the unavailable state on the dist build', async () => {
    isAvailable.mockReturnValue(false);
    render(frameFor('model', 'orders'));
    expect(await screen.findByTestId('canvas-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('model-preview-mock')).not.toBeInTheDocument();
  });

  test('a serve-only canvas renders the body when serve endpoints are available', async () => {
    isAvailable.mockReturnValue(true);
    render(frameFor('model', 'orders'));
    expect(await screen.findByTestId('model-preview-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('canvas-unavailable')).not.toBeInTheDocument();
  });

  test('a type with no descriptor parks on Lineage with the Canvas option muted', () => {
    // Every first-class type now has a canvas, so a genuinely unregistered type
    // exercises the no-descriptor → muted-Canvas → Lineage fallback.
    render(frameFor('gadget', 'mystery'));
    expect(screen.getByTestId('workspace-middle-gadget-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-canvas-mock')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-lens-picker-option-preview')).toBeDisabled();
  });
});
