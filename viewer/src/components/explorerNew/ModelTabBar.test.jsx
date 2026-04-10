/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ModelTabBar from './ModelTabBar';
import useStore from '../../stores/store';

describe('ModelTabBar', () => {
  beforeEach(() => {
    useStore.setState({
      explorerModelTabs: ['model_a', 'model_b'],
      explorerActiveModelName: 'model_a',
      explorerModelStates: {
        model_a: {
          sql: 'SELECT 1',
          sourceName: null,
          queryResult: null,
          queryError: null,
          computedColumns: [],
          enrichedResult: null,
          isNew: true,
        },
        model_b: {
          sql: 'SELECT 2',
          sourceName: null,
          queryResult: null,
          queryError: null,
          computedColumns: [],
          enrichedResult: null,
          isNew: false,
        },
      },
      explorerChartInsightNames: [],
      explorerInsightStates: {},
    });
  });

  it('renders a tab for each model in explorerModelTabs', () => {
    render(<ModelTabBar />);

    expect(screen.getByTestId('model-tab-model_a')).toBeInTheDocument();
    expect(screen.getByTestId('model-tab-model_b')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    render(<ModelTabBar />);

    const activeTab = screen.getByTestId('model-tab-model_a');
    const inactiveTab = screen.getByTestId('model-tab-model_b');

    expect(activeTab.className).toContain('bg-amber-50');
    expect(activeTab.className).toContain('border-amber-500');
    expect(inactiveTab.className).not.toContain('bg-amber-50');
  });

  it('clicking a tab calls switchModelTab', () => {
    render(<ModelTabBar />);

    fireEvent.click(screen.getByTestId('model-tab-model_b'));

    expect(useStore.getState().explorerActiveModelName).toBe('model_b');
  });

  it('clicking [+] calls createModelTab', () => {
    render(<ModelTabBar />);

    fireEvent.click(screen.getByTestId('add-model-tab'));

    const state = useStore.getState();
    expect(state.explorerModelTabs).toHaveLength(3);
    expect(state.explorerActiveModelName).toBe('model');
  });

  it('clicking x on a tab calls closeModelTab', () => {
    render(<ModelTabBar />);

    fireEvent.click(screen.getByTestId('close-tab-model_b'));

    const state = useStore.getState();
    expect(state.explorerModelTabs).toHaveLength(1);
    expect(state.explorerModelTabs).toEqual(['model_a']);
  });

  it('double-click enters rename mode on active tab with isNew=true', () => {
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_a'));

    expect(screen.getByTestId('rename-input')).toBeInTheDocument();
    expect(screen.getByTestId('rename-input').value).toBe('model_a');
  });

  it('double-click does NOT enter rename mode on non-active tab', () => {
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_b'));

    expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
  });

  it('double-click does NOT enter rename mode on active tab with isNew=false', () => {
    useStore.setState({ explorerActiveModelName: 'model_b' });
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_b'));

    expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
  });

  it('rename validates and calls renameModelTab on Enter', () => {
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_a'));

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: 'new_name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const state = useStore.getState();
    expect(state.explorerModelTabs).toContain('new_name');
    expect(state.explorerModelTabs).not.toContain('model_a');
    expect(state.explorerActiveModelName).toBe('new_name');
  });

  it('rename rejects duplicate names', () => {
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_a'));

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: 'model_b' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Should not rename, model_a should still be there
    const state = useStore.getState();
    expect(state.explorerModelTabs).toContain('model_a');
    expect(state.explorerModelTabs).toContain('model_b');
  });

  it('rename rejects empty names', () => {
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_a'));

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const state = useStore.getState();
    expect(state.explorerModelTabs).toContain('model_a');
  });

  it('rename cancels on Escape', () => {
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_a'));

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: 'new_name' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should not rename
    expect(screen.queryByTestId('rename-input')).not.toBeInTheDocument();
    const state = useStore.getState();
    expect(state.explorerModelTabs).toContain('model_a');
    expect(state.explorerModelTabs).not.toContain('new_name');
  });

  it('rename commits on blur', () => {
    render(<ModelTabBar />);

    fireEvent.doubleClick(screen.getByTestId('tab-label-model_a'));

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: 'blurred_name' } });
    fireEvent.blur(input);

    const state = useStore.getState();
    expect(state.explorerModelTabs).toContain('blurred_name');
    expect(state.explorerModelTabs).not.toContain('model_a');
  });

  it('shows green status dot for new models', () => {
    useStore.setState({ explorerDiffResult: { models: { model_a: 'new' } } });
    render(<ModelTabBar />);

    expect(screen.getByTestId('status-dot-model_a')).toBeInTheDocument();
    expect(screen.getByTestId('status-dot-model_a').className).toContain('bg-green-500');
  });

  it('does not show status dot for non-new models with no changes', () => {
    useStore.setState({
      explorerModelStates: {
        ...useStore.getState().explorerModelStates,
        model_b: {
          sql: 'SELECT 2',
          sourceName: 'pg',
          queryResult: null,
          queryError: null,
          computedColumns: [],
          enrichedResult: null,
          isNew: false,
        },
      },
    });

    render(<ModelTabBar />);

    expect(screen.queryByTestId('status-dot-model_b')).not.toBeInTheDocument();
  });

  it('shows amber status dot for modified models', () => {
    useStore.setState({
      explorerDiffResult: { models: { model_b: 'modified' } },
    });

    render(<ModelTabBar />);

    const dot = screen.getByTestId('status-dot-model_b');
    expect(dot).toBeInTheDocument();
    expect(dot.className).toContain('bg-amber-500');
  });

  it('shows "No models" state when tabs are empty', () => {
    useStore.setState({
      explorerModelTabs: [],
      explorerActiveModelName: null,
      explorerModelStates: {},
    });

    render(<ModelTabBar />);

    expect(screen.getByTestId('no-models-message')).toBeInTheDocument();
  });

  it('shows purple outline on tabs referenced by chart insights', () => {
    useStore.setState({
      explorerChartInsightNames: ['ins_1'],
      explorerInsightStates: {
        ins_1: {
          type: 'scatter',
          props: { x: '?{${ref(model_a).col}}' },
          interactions: [],
          typePropsCache: {},
          isNew: true,
        },
      },
    });

    render(<ModelTabBar />);

    const tabA = screen.getByTestId('model-tab-model_a');
    expect(tabA.className).toContain('ring-purple');

    const tabB = screen.getByTestId('model-tab-model_b');
    expect(tabB.className).not.toContain('ring-purple');
  });

  it('does not show close button when there is only one tab', () => {
    useStore.setState({
      explorerModelTabs: ['only_model'],
      explorerActiveModelName: 'only_model',
      explorerModelStates: {
        only_model: {
          sql: '',
          sourceName: null,
          queryResult: null,
          queryError: null,
          computedColumns: [],
          enrichedResult: null,
          isNew: true,
        },
      },
    });

    render(<ModelTabBar />);

    expect(screen.queryByTestId('close-tab-only_model')).not.toBeInTheDocument();
  });
});
