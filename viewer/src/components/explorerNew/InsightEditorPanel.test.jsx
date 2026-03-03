import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightEditorPanel from './InsightEditorPanel';
import useStore from '../../stores/store';

jest.mock('../new-views/common/EditPanel', () => {
  return function MockEditPanel({ editItem, isCreate, onClose, onSave }) {
    return (
      <div data-testid="edit-panel">
        <span data-testid="edit-type">{editItem?.type}</span>
        <span data-testid="edit-is-create">{String(isCreate)}</span>
        <button data-testid="edit-close" onClick={onClose}>
          Close
        </button>
      </div>
    );
  };
});

jest.mock('../new-views/common/InsightEditForm', () => {
  return function MockInsightEditForm({ insight, isCreate, onSave }) {
    return (
      <div data-testid="insight-edit-form">
        <span data-testid="form-type">{insight?.props?.type}</span>
        <span data-testid="form-is-create">{String(isCreate)}</span>
      </div>
    );
  };
});

jest.mock('../new-views/common/objectTypeConfigs', () => ({
  getTypeByValue: (val) => ({
    icon: (props) => <svg data-testid={`${val}-icon`} {...props} />,
    colors: { text: `text-${val}` },
    singularLabel: val.charAt(0).toUpperCase() + val.slice(1),
  }),
}));

describe('InsightEditorPanel', () => {
  beforeEach(() => {
    useStore.setState({
      explorerEditStack: [],
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerModelName: '',
      explorerChartName: '',
      explorerSql: '',
      explorerSourceName: null,
      explorerSavedModelName: null,
      explorerSavedInsightName: null,
      explorerIsSaving: false,
      saveModel: jest.fn().mockResolvedValue({ success: true }),
      saveInsight: jest.fn().mockResolvedValue({ success: true }),
      saveChart: jest.fn().mockResolvedValue({ success: true }),
    });
  });

  it('renders always-on insight editor when edit stack is empty', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('insight-editor-panel')).toBeInTheDocument();
    expect(screen.getByTestId('object-naming-header')).toBeInTheDocument();
    expect(screen.getByTestId('insight-edit-form')).toBeInTheDocument();
  });

  it('renders object naming inputs', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('model-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('insight-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('chart-name-input')).toBeInTheDocument();
  });

  it('renders type icons for model, insight, chart', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('model-icon')).toBeInTheDocument();
    expect(screen.getByTestId('insight-icon')).toBeInTheDocument();
    expect(screen.getByTestId('chart-icon')).toBeInTheDocument();
  });

  it('updates model name in store', () => {
    render(<InsightEditorPanel />);

    fireEvent.change(screen.getByTestId('model-name-input'), {
      target: { value: 'orders_model' },
    });

    expect(useStore.getState().explorerModelName).toBe('orders_model');
  });

  it('updates insight name in store', () => {
    render(<InsightEditorPanel />);

    fireEvent.change(screen.getByTestId('insight-name-input'), {
      target: { value: 'orders_insight' },
    });

    expect(useStore.getState().explorerInsightConfig.name).toBe('orders_insight');
  });

  it('updates chart name in store', () => {
    render(<InsightEditorPanel />);

    fireEvent.change(screen.getByTestId('chart-name-input'), {
      target: { value: 'orders_chart' },
    });

    expect(useStore.getState().explorerChartName).toBe('orders_chart');
  });

  it('disables save button when names are empty', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-to-project-button')).toBeDisabled();
  });

  it('enables save button when all names and SQL/source are set', () => {
    useStore.setState({
      explorerModelName: 'model',
      explorerInsightConfig: { name: 'insight', props: { type: 'scatter' } },
      explorerChartName: 'chart',
      explorerSql: 'SELECT 1',
      explorerSourceName: 'pg',
    });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-to-project-button')).not.toBeDisabled();
  });

  it('shows saving state', () => {
    useStore.setState({ explorerIsSaving: true });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-to-project-button')).toHaveTextContent('Saving...');
  });

  it('shows save status when model has been saved', () => {
    useStore.setState({ explorerSavedModelName: 'my_model' });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved: my_model');
  });

  it('shows save status with insight name', () => {
    useStore.setState({
      explorerSavedModelName: 'my_model',
      explorerSavedInsightName: 'my_insight',
    });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-status')).toHaveTextContent('my_model → my_insight');
  });

  it('collapses and expands the naming section', () => {
    render(<InsightEditorPanel />);

    // Initially expanded
    expect(screen.getByTestId('model-name-input')).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByTestId('toggle-naming'));
    expect(screen.queryByTestId('model-name-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-to-project-button')).not.toBeInTheDocument();

    // Re-expand
    fireEvent.click(screen.getByTestId('toggle-naming'));
    expect(screen.getByTestId('model-name-input')).toBeInTheDocument();
  });

  it('shows summary text when naming is collapsed and names are set', () => {
    useStore.setState({ explorerModelName: 'orders_model' });

    render(<InsightEditorPanel />);

    fireEvent.click(screen.getByTestId('toggle-naming'));
    expect(screen.getByText('orders_model')).toBeInTheDocument();
  });

  it('renders EditPanel when edit stack has items', () => {
    useStore.setState({
      explorerEditStack: [
        { type: 'model', object: { name: 'test', config: {} }, isCreate: false },
      ],
    });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('edit-panel')).toBeInTheDocument();
    expect(screen.getByTestId('edit-type')).toHaveTextContent('model');
    expect(screen.queryByTestId('object-naming-header')).not.toBeInTheDocument();
  });

  it('close on EditPanel clears edit stack', () => {
    useStore.setState({
      explorerEditStack: [
        { type: 'model', object: { name: 'test', config: {} }, isCreate: false },
      ],
    });

    render(<InsightEditorPanel />);

    fireEvent.click(screen.getByTestId('edit-close'));

    expect(useStore.getState().explorerEditStack).toEqual([]);
  });
});
