/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorerInputsToolbar from './ExplorerInputsToolbar';
import useStore from '../../stores/store';

jest.mock('../items/Input', () => {
  return function MockInput({ input, projectId, itemWidth }) {
    return (
      <div
        data-testid={`mock-input-${input.name}`}
        data-type={input.type}
        data-project-id={projectId}
        data-item-width={itemWidth}
      >
        {input.name}
      </div>
    );
  };
});

const insightUsingInputs = {
  type: 'scatter',
  props: { x: '?{${ref(region).value}}' },
  interactions: [{ type: 'filter', value: '?{${ref(threshold).value} > 5}' }],
  typePropsCache: {},
  isNew: true,
};

const defaultState = {
  inputs: [
    { name: 'region', config: { type: 'single-select', display: { type: 'dropdown' } } },
    { name: 'threshold', config: { type: 'single-select' } },
    { name: 'unused_input', config: { type: 'multi-select' } },
  ],
  explorerChartInsightNames: ['ins_1'],
  explorerInsightStates: { ins_1: { ...insightUsingInputs } },
};

describe('ExplorerInputsToolbar', () => {
  beforeEach(() => {
    useStore.setState(defaultState);
  });

  it('renders nothing when no inputs are referenced by chart insights', () => {
    useStore.setState({
      explorerInsightStates: {
        ins_1: { ...insightUsingInputs, props: {}, interactions: [] },
      },
    });

    render(<ExplorerInputsToolbar projectId="proj_1" />);

    expect(screen.queryByTestId('explorer-inputs-toolbar')).not.toBeInTheDocument();
  });

  it('renders nothing when the store has no inputs at all', () => {
    useStore.setState({ inputs: [] });

    render(<ExplorerInputsToolbar projectId="proj_1" />);

    expect(screen.queryByTestId('explorer-inputs-toolbar')).not.toBeInTheDocument();
  });

  it('renders a widget for each input referenced in props or interactions', () => {
    render(<ExplorerInputsToolbar projectId="proj_1" />);

    expect(screen.getByTestId('explorer-inputs-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-input-region')).toBeInTheDocument();
    expect(screen.getByTestId('mock-input-threshold')).toBeInTheDocument();
  });

  it('does not render inputs that exist in the store but are not referenced', () => {
    render(<ExplorerInputsToolbar projectId="proj_1" />);

    expect(screen.queryByTestId('mock-input-unused_input')).not.toBeInTheDocument();
  });

  it('shows the referenced input count in the toggle label', () => {
    render(<ExplorerInputsToolbar projectId="proj_1" />);

    expect(screen.getByText('Inputs (2)')).toBeInTheDocument();
  });

  it('flattens input config onto the object passed to Input', () => {
    render(<ExplorerInputsToolbar projectId="proj_1" />);

    const regionInput = screen.getByTestId('mock-input-region');
    expect(regionInput).toHaveAttribute('data-type', 'single-select');
    expect(regionInput).toHaveAttribute('data-project-id', 'proj_1');
    expect(regionInput).toHaveAttribute('data-item-width', '1');
  });

  it('collapses and re-expands the input widgets on toggle click', () => {
    render(<ExplorerInputsToolbar projectId="proj_1" />);

    const toggle = screen.getByRole('button', { name: /inputs \(2\)/i });

    fireEvent.click(toggle);
    expect(screen.queryByTestId('mock-input-region')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-input-threshold')).not.toBeInTheDocument();
    // Header stays visible while collapsed
    expect(screen.getByText('Inputs (2)')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByTestId('mock-input-region')).toBeInTheDocument();
    expect(screen.getByTestId('mock-input-threshold')).toBeInTheDocument();
  });

  it('dispatches a window resize event after toggling so Plotly relayouts', () => {
    const rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(cb => {
        cb();
        return 0;
      });
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

    render(<ExplorerInputsToolbar projectId="proj_1" />);
    fireEvent.click(screen.getByRole('button', { name: /inputs \(2\)/i }));

    expect(
      dispatchSpy.mock.calls.some(([event]) => event.type === 'resize')
    ).toBe(true);

    rafSpy.mockRestore();
    dispatchSpy.mockRestore();
  });

  it('only shows inputs referenced by insights attached to the chart', () => {
    useStore.setState({
      explorerChartInsightNames: [],
      explorerInsightStates: { ins_1: { ...insightUsingInputs } },
    });

    render(<ExplorerInputsToolbar projectId="proj_1" />);

    expect(screen.queryByTestId('explorer-inputs-toolbar')).not.toBeInTheDocument();
  });
});
