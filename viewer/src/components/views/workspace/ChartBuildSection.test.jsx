/**
 * ChartBuildSection (Explore 2.0 Phase 3b, VIS-1059) — ported from the
 * retired `ChartCRUDSection`'s test suite; behavior is unchanged (this
 * section's Layout Properties body stays on `SchemaEditor`, see the
 * component's own docstring for why).
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DndContext } from '@dnd-kit/core';
import ChartBuildSection from './ChartBuildSection';
import useStore from '../../../stores/store';

// Each test below uses `await screen.findBy*` for its first DOM lookup so the
// component's async useEffect (getSchema -> setLayoutSchema) is flushed inside
// an act() scope before assertions, eliminating "not wrapped in act" warnings.
const renderInDnd = (ui) => render(<DndContext>{ui}</DndContext>);

jest.mock('../lineage/EmbeddedPill', () => {
  return function MockEmbeddedPill({
    objectType,
    label,
    onRemove,
    onClick,
    statusDot,
    isActive,
  }) {
    return (
      <span
        data-testid={`embedded-pill-${objectType}-${label}`}
        data-active={isActive}
        data-status={statusDot}
        onClick={onClick}
      >
        {label}
        {onRemove && (
          <button
            data-testid={`embedded-pill-remove-${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(e);
            }}
          >
            x
          </button>
        )}
      </span>
    );
  };
});

let capturedLayoutOnChange = null;

jest.mock('../common/SchemaEditor/SchemaEditor', () => {
  const MockSchemaEditor = ({ schema, value, onChange }) => {
    capturedLayoutOnChange = onChange;
    return (
      <div data-testid="chart-schema-editor">
        ChartSchemaEditor: {JSON.stringify(value)}
      </div>
    );
  };
  return { SchemaEditor: MockSchemaEditor, __esModule: true, default: MockSchemaEditor };
});

jest.mock('../../../schemas/schemas', () => ({
  getSchema: jest.fn().mockResolvedValue({ properties: { title: {} } }),
}));

const defaultState = {
  explorerChartName: 'test_chart',
  explorerChartLayout: { title: { text: 'My Chart' } },
  explorerChartInsightNames: ['insight_1', 'insight_2'],
  explorerActiveInsightName: 'insight_1',
  charts: [],
  explorerInsightStates: {
    insight_1: {
      type: 'scatter',
      props: {},
      interactions: [],
      typePropsCache: {},
      isNew: true,
    },
    insight_2: {
      type: 'bar',
      props: {},
      interactions: [],
      typePropsCache: {},
      isNew: false,
    },
  },
};

describe('ChartBuildSection', () => {
  let originalActions;

  beforeAll(() => {
    const s = useStore.getState();
    originalActions = {
      setChartName: s.setChartName,
      replaceChartLayout: s.replaceChartLayout,
      createInsight: s.createInsight,
      removeInsightFromChart: s.removeInsightFromChart,
      setActiveInsight: s.setActiveInsight,
      closeChart: s.closeChart,
    };
  });

  beforeEach(() => {
    capturedLayoutOnChange = null;
    useStore.setState({ ...originalActions, ...defaultState });
  });

  it('renders chart name in header', async () => {
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    // Chart name is always rendered as an input (disabled when loaded,
    // editable otherwise). Assert by value rather than text content.
    expect(await screen.findByDisplayValue('test_chart')).toBeInTheDocument();
  });

  it('chart name input is editable when chart is new (not loaded)', async () => {
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const nameEl = await screen.findByTestId('chart-name-input');
    expect(nameEl.tagName).toBe('INPUT');
    expect(nameEl).not.toBeDisabled();
  });

  it('chart name input is disabled when chart is loaded from cache', async () => {
    useStore.setState({ charts: [{ name: 'test_chart' }] });
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const nameEl = await screen.findByTestId('chart-name-input');
    expect(nameEl.tagName).toBe('INPUT');
    expect(nameEl).toBeDisabled();
  });

  it('renders insight list with pills', async () => {
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(await screen.findByTestId('chart-insight-pill-insight_1')).toBeInTheDocument();
    expect(screen.getByTestId('chart-insight-pill-insight_2')).toBeInTheDocument();
  });

  it('active insight is highlighted', async () => {
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const activePill = await screen.findByTestId('embedded-pill-insight-insight_1');
    expect(activePill.dataset.active).toBe('true');
  });

  it('remove button on pill calls removeInsightFromChart', async () => {
    const removeInsightFromChart = jest.fn();
    useStore.setState({ removeInsightFromChart });
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('embedded-pill-remove-insight_2'));
    expect(removeInsightFromChart).toHaveBeenCalledWith('insight_2');
  });

  it('add insight button calls createInsight', async () => {
    const createInsight = jest.fn();
    useStore.setState({ createInsight });
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('chart-add-insight'));
    expect(createInsight).toHaveBeenCalled();
  });

  it('renders layout SchemaEditor when expanded', async () => {
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(await screen.findByTestId('chart-schema-editor')).toBeInTheDocument();
  });

  it('does not render SchemaEditor when collapsed', async () => {
    renderInDnd(<ChartBuildSection isExpanded={false} onToggleExpand={jest.fn()} />);
    // Wait for the always-rendered chart name input so the schema-fetch
    // effect settles before we assert the absence of the schema editor.
    await screen.findByDisplayValue('test_chart');
    expect(screen.queryByTestId('chart-schema-editor')).not.toBeInTheDocument();
  });

  it('chart name is always visible in header even when collapsed', async () => {
    renderInDnd(<ChartBuildSection isExpanded={false} onToggleExpand={jest.fn()} />);
    expect(await screen.findByDisplayValue('test_chart')).toBeInTheDocument();
  });

  it('collapse/expand toggle works', async () => {
    const onToggleExpand = jest.fn();
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={onToggleExpand} />);
    fireEvent.click(await screen.findByTestId('chart-toggle'));
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('close button calls closeChart', async () => {
    const closeChart = jest.fn();
    useStore.setState({ closeChart });
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('chart-close'));
    expect(closeChart).toHaveBeenCalled();
  });

  it('clicking an insight pill calls setActiveInsight', async () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    fireEvent.click(await screen.findByTestId('embedded-pill-insight-insight_2'));
    expect(setActiveInsight).toHaveBeenCalledWith('insight_2');
  });

  it('renders empty insights message when no insights', async () => {
    useStore.setState({ explorerChartInsightNames: [], explorerInsightStates: {} });
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    expect(await screen.findByText(/no insights/i)).toBeInTheDocument();
  });

  describe('insight drop zone', () => {
    it('renders the drop zone with correct test id when expanded', async () => {
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      expect(await screen.findByTestId('chart-insight-drop-zone')).toBeInTheDocument();
    });

    it('does not render the drop zone when collapsed', async () => {
      renderInDnd(<ChartBuildSection isExpanded={false} onToggleExpand={jest.fn()} />);
      await screen.findByDisplayValue('test_chart');
      expect(screen.queryByTestId('chart-insight-drop-zone')).not.toBeInTheDocument();
    });

    it('drop zone wraps the insights list and add button', async () => {
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      const dropZone = await screen.findByTestId('chart-insight-drop-zone');
      expect(dropZone).toContainElement(screen.getByTestId('chart-add-insight'));
      expect(dropZone).toContainElement(screen.getByTestId('chart-insight-pill-insight_1'));
    });

    it('drop zone shows updated empty hint with drag instruction', async () => {
      useStore.setState({ explorerChartInsightNames: [], explorerInsightStates: {} });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      expect(await screen.findByText(/drag from the library/i)).toBeInTheDocument();
    });
  });

  describe('layout changes', () => {
    it('forwards layout object changes to replaceChartLayout', async () => {
      const replaceChartLayout = jest.fn();
      useStore.setState({ replaceChartLayout });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      await screen.findByTestId('chart-schema-editor');

      capturedLayoutOnChange({ title: { text: 'Updated' } });

      expect(replaceChartLayout).toHaveBeenCalledWith({ title: { text: 'Updated' } });
    });

    it('ignores non-object layout values', async () => {
      const replaceChartLayout = jest.fn();
      useStore.setState({ replaceChartLayout });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      await screen.findByTestId('chart-schema-editor');

      capturedLayoutOnChange(null);
      capturedLayoutOnChange('a string');

      expect(replaceChartLayout).not.toHaveBeenCalled();
    });
  });

  describe('rename flow', () => {
    it('commits a trimmed rename on blur', async () => {
      const setChartName = jest.fn();
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '  renamed_chart  ' } });
      fireEvent.blur(input);

      expect(setChartName).toHaveBeenCalledWith('renamed_chart');
    });

    it('does not commit when the name is unchanged', async () => {
      const setChartName = jest.fn();
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(setChartName).not.toHaveBeenCalled();
    });

    it('resets to the current name when cleared and blurred', async () => {
      const setChartName = jest.fn();
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.blur(input);

      expect(setChartName).not.toHaveBeenCalled();
      expect(input).toHaveValue('test_chart');
    });

    it('does not commit the placeholder name "Untitled"', async () => {
      const setChartName = jest.fn();
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Untitled' } });
      fireEvent.blur(input);

      expect(setChartName).not.toHaveBeenCalled();
      expect(input).toHaveValue('test_chart');
    });

    it('commits rename on Enter via blur', async () => {
      const setChartName = jest.fn();
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      act(() => input.focus());
      fireEvent.change(input, { target: { value: 'enter_chart' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(setChartName).toHaveBeenCalledWith('enter_chart');
    });

    it('Escape cancels the rename and restores the previous name', async () => {
      const setChartName = jest.fn();
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      act(() => input.focus());
      fireEvent.change(input, { target: { value: 'abandoned_name' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(setChartName).not.toHaveBeenCalled();
      expect(input).toHaveValue('test_chart');
      expect(screen.queryByTestId('chart-rename-error')).not.toBeInTheDocument();
    });

    it('shows collision error inline and keeps editing when the name is taken', async () => {
      const setChartName = jest.fn(() => {
        const err = new Error('Name "dupe" is already in use by a model. Choose a different name.');
        err.code = 'NAME_COLLISION';
        throw err;
      });
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'dupe' } });
      fireEvent.blur(input);

      const error = screen.getByTestId('chart-rename-error');
      expect(error).toHaveTextContent('already in use by a model');
      // Editing continues so the user can correct the name
      expect(input).toHaveValue('dupe');
    });

    it('typing after a collision clears the error', async () => {
      const setChartName = jest.fn(() => {
        const err = new Error('Name "dupe" is already in use. Choose a different name.');
        err.code = 'NAME_COLLISION';
        throw err;
      });
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'dupe' } });
      fireEvent.blur(input);
      expect(screen.getByTestId('chart-rename-error')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'dupe_2' } });
      expect(screen.queryByTestId('chart-rename-error')).not.toBeInTheDocument();
    });

    it('successful rename clears any previous error', async () => {
      const setChartName = jest.fn();
      useStore.setState({ setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);

      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'clean_name' } });
      fireEvent.blur(input);

      expect(setChartName).toHaveBeenCalledWith('clean_name');
      expect(screen.queryByTestId('chart-rename-error')).not.toBeInTheDocument();
    });
  });

  it('tolerates `charts` being undefined (not just empty) — no crash, treated as not-loaded', async () => {
    useStore.setState({ charts: undefined });
    renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
    const nameEl = await screen.findByTestId('chart-name-input');
    expect(nameEl).not.toBeDisabled();
  });

  describe('chartName unset (Untitled fallback branches)', () => {
    it('renders "Untitled" in italic placeholder styling when there is no chart name yet', async () => {
      useStore.setState({ explorerChartName: '' });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      const input = await screen.findByTestId('chart-name-input');
      expect(input).toHaveValue('Untitled');
      expect(input.className).toContain('italic');
      expect(input.className).toContain('text-gray-400');
    });

    it('committing an empty/whitespace name while unset resets to "Untitled" (chartName||"Untitled" fallback)', async () => {
      const setChartName = jest.fn();
      useStore.setState({ explorerChartName: '', setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.blur(input);
      expect(setChartName).not.toHaveBeenCalled();
      expect(input).toHaveValue('Untitled');
    });

    it('Escape while unset restores "Untitled" (chartName||"Untitled" fallback in the Escape handler)', async () => {
      useStore.setState({ explorerChartName: '' });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'abandoned' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toHaveValue('Untitled');
    });

    it('re-typing "Untitled" verbatim while unset is a no-op (matches the chartName||"Untitled" fallback, not just the literal check)', async () => {
      const setChartName = jest.fn();
      useStore.setState({ explorerChartName: '', setChartName });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      const input = await screen.findByTestId('chart-name-input');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'Untitled' } });
      fireEvent.blur(input);
      expect(setChartName).not.toHaveBeenCalled();
      expect(input).toHaveValue('Untitled');
    });
  });

  describe('chartLayout undefined (Object.keys(chartLayout||{}) fallback)', () => {
    it('tolerates an undefined chartLayout without crashing', async () => {
      useStore.setState({ explorerChartLayout: undefined });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      expect(await screen.findByTestId('chart-schema-editor')).toBeInTheDocument();
    });
  });

  describe('closeChart optional chaining (`closeChart?.()`)', () => {
    it('tolerates an undefined closeChart action without crashing', async () => {
      useStore.setState({ closeChart: undefined });
      renderInDnd(<ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />);
      await screen.findByTestId('chart-schema-editor');
      expect(() => {
        fireEvent.click(screen.getByTestId('chart-close'));
      }).not.toThrow();
    });
  });

  describe('layout schema load race (`cancelled` guard)', () => {
    it('unmounting before getSchema resolves never updates state on the unmounted component', async () => {
      const { getSchema } = jest.requireMock('../../../schemas/schemas');
      let resolveSchema;
      getSchema.mockImplementationOnce(() => new Promise(r => (resolveSchema = r)));
      const { unmount } = renderInDnd(
        <ChartBuildSection isExpanded={true} onToggleExpand={jest.fn()} />
      );
      unmount();
      await act(async () => resolveSchema({ properties: {} }));
    });
  });
});
