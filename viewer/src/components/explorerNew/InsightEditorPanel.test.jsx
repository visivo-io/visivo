import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightEditorPanel from './InsightEditorPanel';
import useStore from '../../stores/store';

jest.mock('./SaveToProjectModal', () => {
  return function MockSaveToProjectModal() {
    return null;
  };
});

jest.mock('../new-views/common/SchemaEditor/SchemaEditor', () => ({
  SchemaEditor: function MockSchemaEditor({ schema, value, onChange, excludeProperties, initiallyExpanded, droppable }) {
    const id = excludeProperties?.length > 0 ? 'props' : 'layout';
    return (
      <div data-testid={`schema-editor-${id}`}>
        <span data-testid={`se-exclude-${id}`}>{JSON.stringify(excludeProperties)}</span>
        <span data-testid={`se-value-${id}`}>{JSON.stringify(value)}</span>
        <span data-testid={`se-initially-expanded-${id}`}>{JSON.stringify(initiallyExpanded)}</span>
        <span data-testid={`se-droppable-${id}`}>{String(!!droppable)}</span>
        {onChange && (
          <button
            data-testid={`se-trigger-change-${id}`}
            onClick={() => onChange({ marker: { color: 'red' } })}
          />
        )}
      </div>
    );
  },
}));

jest.mock('../../schemas/schemas', () => ({
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter' },
    { value: 'bar', label: 'Bar' },
    { value: 'pie', label: 'Pie' },
  ],
  getSchema: jest.fn((type) =>
    Promise.resolve({ type: 'object', properties: { [`${type}_prop`]: { type: 'string' } } })
  ),
}));

jest.mock('../new-views/common/insightRequiredFields', () => ({
  getRequiredFields: jest.fn((type) => {
    if (type === 'scatter') return [{ name: 'x', type: 'dataArray' }, { name: 'y', type: 'dataArray' }];
    if (type === 'bar') return [{ name: 'x', type: 'dataArray' }, { name: 'y', type: 'dataArray' }];
    if (type === 'pie') return [{ name: 'labels', type: 'dataArray' }, { name: 'values', type: 'dataArray' }];
    return [];
  }),
}));

describe('InsightEditorPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerChartLayout: {},
      explorerQueryResult: null,
      explorerSaveModalOpen: false,
      setExplorerInsightConfig: jest.fn((config) => {
        useStore.setState({ explorerInsightConfig: config });
      }),
      syncPlotlyEditsToChartLayout: jest.fn(),
      setExplorerSaveModalOpen: jest.fn(),
    });
  });

  it('renders the panel with insight type selector', async () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('insight-editor-panel')).toBeInTheDocument();
    expect(screen.getByTestId('insight-type-section')).toBeInTheDocument();
    expect(screen.getByTestId('insight-type-select')).toBeInTheDocument();
  });

  it('shows correct default insight type', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('insight-type-select')).toHaveValue('scatter');
  });

  it('renders all chart type options', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByRole('option', { name: 'Scatter' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bar' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pie' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('changes insight type and updates store', () => {
    const mockSetConfig = jest.fn();
    useStore.setState({ setExplorerInsightConfig: mockSetConfig });

    render(<InsightEditorPanel />);

    fireEvent.change(screen.getByTestId('insight-type-select'), {
      target: { value: 'bar' },
    });

    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ type: 'bar' }),
      })
    );
  });

  it('preserves compatible field values when changing type', () => {
    const mockSetConfig = jest.fn();
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'col_a', y: 'col_b', marker: { size: 5 } } },
      setExplorerInsightConfig: mockSetConfig,
    });

    render(<InsightEditorPanel />);

    // scatter→bar: both have x,y required fields, so x and y should be preserved
    fireEvent.change(screen.getByTestId('insight-type-select'), {
      target: { value: 'bar' },
    });

    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { type: 'bar', x: 'col_a', y: 'col_b' },
      })
    );
  });

  it('drops incompatible fields when changing to a type with different required fields', () => {
    const mockSetConfig = jest.fn();
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'col_a', y: 'col_b' } },
      setExplorerInsightConfig: mockSetConfig,
    });

    render(<InsightEditorPanel />);

    // scatter→pie: pie requires labels/values, not x/y
    fireEvent.change(screen.getByTestId('insight-type-select'), {
      target: { value: 'pie' },
    });

    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { type: 'pie' },
      })
    );
  });

  it('insight properties section starts expanded', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('insight-props-section')).toBeInTheDocument();
  });

  it('collapses insight properties on click', async () => {
    render(<InsightEditorPanel />);

    // Starts expanded, wait for schema to load
    await waitFor(() => {
      expect(screen.getByTestId('insight-props-editor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-insight-props'));

    expect(screen.queryByTestId('insight-props-editor')).not.toBeInTheDocument();
  });

  it('shows configured props count badge', () => {
    useStore.setState({
      explorerInsightConfig: {
        name: '',
        props: { type: 'scatter', x: 'col_a', y: 'col_b', marker: { size: 5 }, mode: 'lines' },
      },
    });

    render(<InsightEditorPanel />);

    // All non-type props count: x, y, marker, mode = 4
    const propsSection = screen.getByTestId('insight-props-section');
    expect(propsSection).toHaveTextContent('4');
  });

  it('does not show props count badge when only type is set', () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
    });

    render(<InsightEditorPanel />);

    const button = screen.getByTestId('toggle-insight-props');
    expect(button).toHaveTextContent('Insight Properties');
    expect(button.textContent).not.toMatch(/\d/);
  });

  it('chart layout section starts collapsed', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('chart-layout-section')).toBeInTheDocument();
    expect(screen.queryByTestId('chart-layout-editor')).not.toBeInTheDocument();
  });

  it('expands chart layout on click', async () => {
    render(<InsightEditorPanel />);

    fireEvent.click(screen.getByTestId('toggle-chart-layout'));

    await waitFor(() => {
      expect(screen.getByTestId('chart-layout-editor')).toBeInTheDocument();
    });
  });

  it('shows layout props count badge when layout has properties', () => {
    useStore.setState({
      explorerChartLayout: { title: { text: 'My Chart' }, xaxis: { title: { text: 'X' } } },
    });

    render(<InsightEditorPanel />);

    const layoutSection = screen.getByTestId('chart-layout-section');
    expect(layoutSection).toHaveTextContent('2');
  });

  it('save button is disabled without query results', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-to-project-button')).toBeDisabled();
  });

  it('save button is enabled with query results', () => {
    useStore.setState({
      explorerQueryResult: { columns: ['a', 'b'], rows: [{ a: 1, b: 2 }], row_count: 1 },
    });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-to-project-button')).not.toBeDisabled();
  });

  it('save button opens save modal', () => {
    const mockSetModalOpen = jest.fn();
    useStore.setState({
      explorerQueryResult: { columns: ['a'], rows: [{ a: 1 }], row_count: 1 },
      setExplorerSaveModalOpen: mockSetModalOpen,
    });

    render(<InsightEditorPanel />);

    fireEvent.click(screen.getByTestId('save-to-project-button'));

    expect(mockSetModalOpen).toHaveBeenCalledWith(true);
  });

  it('save button shows correct text', () => {
    render(<InsightEditorPanel />);

    expect(screen.getByTestId('save-to-project-button')).toHaveTextContent('Save to Project');
  });

  it('only excludes type from schema editor', async () => {
    render(<InsightEditorPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('insight-props-editor')).toBeInTheDocument();
    });

    const excluded = JSON.parse(screen.getByTestId('se-exclude-props').textContent);
    expect(excluded).toEqual(['type']);
  });

  it('auto-expands required fields in schema editor', async () => {
    render(<InsightEditorPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('insight-props-editor')).toBeInTheDocument();
    });

    const expanded = JSON.parse(screen.getByTestId('se-initially-expanded-props').textContent);
    expect(expanded).toContain('x');
    expect(expanded).toContain('y');
  });

  it('passes droppable=true to insight props schema editor', async () => {
    render(<InsightEditorPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('insight-props-editor')).toBeInTheDocument();
    });

    expect(screen.getByTestId('se-droppable-props')).toHaveTextContent('true');
  });

  it('layout schema editor is not droppable', async () => {
    render(<InsightEditorPanel />);

    fireEvent.click(screen.getByTestId('toggle-chart-layout'));

    await waitFor(() => {
      expect(screen.getByTestId('chart-layout-editor')).toBeInTheDocument();
    });

    expect(screen.getByTestId('se-droppable-layout')).toHaveTextContent('false');
  });

  it('passes insight props value to schema editor', async () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'scatter', x: 'a', marker: { size: 5 } } },
    });

    render(<InsightEditorPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('insight-props-editor')).toBeInTheDocument();
    });

    const value = JSON.parse(screen.getByTestId('se-value-props').textContent);
    expect(value.type).toBe('scatter');
    expect(value.marker).toEqual({ size: 5 });
  });

  it('updates insight config when schema editor changes props', async () => {
    const mockSetConfig = jest.fn();
    useStore.setState({ setExplorerInsightConfig: mockSetConfig });

    render(<InsightEditorPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('insight-props-editor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('se-trigger-change-props'));

    expect(mockSetConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ marker: { color: 'red' } }),
      })
    );
  });

  it('uses chart layout from store for layout schema editor', async () => {
    useStore.setState({
      explorerChartLayout: { title: { text: 'Test' } },
    });

    render(<InsightEditorPanel />);

    fireEvent.click(screen.getByTestId('toggle-chart-layout'));

    await waitFor(() => {
      expect(screen.getByTestId('chart-layout-editor')).toBeInTheDocument();
    });

    const value = JSON.parse(screen.getByTestId('se-value-layout').textContent);
    expect(value.title.text).toBe('Test');
  });

  it('calls syncPlotlyEdits when layout schema editor changes', async () => {
    const mockSync = jest.fn();
    useStore.setState({ syncPlotlyEditsToChartLayout: mockSync });

    render(<InsightEditorPanel />);

    fireEvent.click(screen.getByTestId('toggle-chart-layout'));

    await waitFor(() => {
      expect(screen.getByTestId('chart-layout-editor')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('se-trigger-change-layout'));

    expect(mockSync).toHaveBeenCalledWith({ marker: { color: 'red' } });
  });

  it('reads insight type from store config', () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: { type: 'bar' } },
    });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('insight-type-select')).toHaveValue('bar');
  });

  it('defaults to scatter when no type in config', () => {
    useStore.setState({
      explorerInsightConfig: { name: '', props: {} },
    });

    render(<InsightEditorPanel />);

    expect(screen.getByTestId('insight-type-select')).toHaveValue('scatter');
  });

  it('updates required field auto-expansion when type changes', async () => {
    render(<InsightEditorPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('insight-props-editor')).toBeInTheDocument();
    });

    // Initially scatter: x, y
    let expanded = JSON.parse(screen.getByTestId('se-initially-expanded-props').textContent);
    expect(expanded).toContain('x');
    expect(expanded).toContain('y');

    // Change to pie
    fireEvent.change(screen.getByTestId('insight-type-select'), {
      target: { value: 'pie' },
    });

    await waitFor(() => {
      expanded = JSON.parse(screen.getByTestId('se-initially-expanded-props').textContent);
      expect(expanded).toContain('labels');
    });
    expect(expanded).toContain('values');
  });
});
