/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightCRUDSection from './InsightCRUDSection';
import useStore from '../../stores/store';

/**
 * Render and fully flush the component's async schema effect before returning,
 * so a later state update can't reset an opened react-select menu mid-assert.
 * (The chart-type picker is now the brand <Select>; its options only exist in
 * the DOM while the menu is open.)
 */
async function renderSettled(ui) {
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    render(ui);
  });
}

/** Open a brand <Select>'s menu by its container test id. */
function openSelectMenu(testId) {
  fireEvent.mouseDown(within(screen.getByTestId(testId)).getByRole('combobox'));
}

let capturedSchemaOnChange = null;

jest.mock('../views/common/SchemaEditor/SchemaEditor', () => {
  const MockSchemaEditor = ({ schema, value, onChange, droppable }) => {
    capturedSchemaOnChange = onChange;
    return (
      <div data-testid="schema-editor" data-droppable={droppable}>
        SchemaEditor: {JSON.stringify(value)}
      </div>
    );
  };
  return { SchemaEditor: MockSchemaEditor, __esModule: true, default: MockSchemaEditor };
});

jest.mock('../views/common/RefTextArea', () => {
  return function MockRefTextArea({ value, onChange }) {
    return (
      <textarea
        data-testid="mock-ref-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  };
});

jest.mock('../../schemas/schemas', () => ({
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter / Line' },
    { value: 'bar', label: 'Bar' },
    { value: 'pie', label: 'Pie' },
  ],
  getSchema: jest.fn().mockResolvedValue({ properties: { x: {}, y: {} } }),
}));

jest.mock('../views/common/insightRequiredFields', () => ({
  getRequiredFields: jest.fn((type) => {
    if (type === 'scatter') return [{ name: 'x' }, { name: 'y' }];
    if (type === 'bar') return [{ name: 'x' }, { name: 'y' }];
    return [];
  }),
}));

const defaultInsightState = {
  type: 'scatter',
  props: { x: '?{${ref(model).col_x}}', y: '?{${ref(model).col_y}}' },
  interactions: [],
  typePropsCache: {},
  isNew: true,
};

const setupStore = (overrides = {}) => {
  useStore.setState({
    explorerInsightStates: {
      test_insight: { ...defaultInsightState },
    },
    explorerActiveInsightName: 'test_insight',
    explorerChartInsightNames: ['test_insight'],
    ...overrides,
  });
};

describe('InsightCRUDSection', () => {
  let originalActions;

  beforeAll(() => {
    const s = useStore.getState();
    originalActions = {
      setInsightType: s.setInsightType,
      setInsightProp: s.setInsightProp,
      removeInsightProp: s.removeInsightProp,
      removeInsightFromChart: s.removeInsightFromChart,
      addInsightInteraction: s.addInsightInteraction,
      removeInsightInteraction: s.removeInsightInteraction,
      updateInsightInteraction: s.updateInsightInteraction,
      setActiveInsight: s.setActiveInsight,
      renameInsight: s.renameInsight,
      restorePropsFromCache: s.restorePropsFromCache,
    };
  });

  beforeEach(() => {
    capturedSchemaOnChange = null;
    useStore.setState({ ...originalActions });
    setupStore();
  });

  // Each test uses `await screen.findBy*` for its first DOM lookup so the
  // component's async useEffect (getSchema -> setSchema) is flushed inside
  // an act() scope before assertions. findBy* succeeds immediately when the
  // element is already in the DOM, but the await still drains pending React
  // updates within act, eliminating "not wrapped in act" warnings.

  it('renders insight name with purple styling', async () => {
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    expect(await screen.findByText('test_insight')).toBeInTheDocument();
    const section = screen.getByTestId('insight-crud-section-test_insight');
    expect(section).toBeInTheDocument();
    const header = screen.getByTestId('insight-header-test_insight');
    expect(header.className).toContain('border-purple');
  });

  it('renders type selector dropdown with CHART_TYPES', async () => {
    await renderSettled(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const select = screen.getByTestId('insight-type-select-test_insight');
    // The current type shows as the selected value.
    expect(select).toHaveTextContent('Scatter / Line');

    // Options render as real DOM when the menu opens (react-select, not native).
    openSelectMenu('insight-type-select-test_insight');
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3);
    expect(options.map((o) => o.textContent)).toEqual(['Scatter / Line', 'Bar', 'Pie']);
  });

  it('changing type calls setInsightType', async () => {
    const setInsightType = jest.fn();
    useStore.setState({ setInsightType });

    await renderSettled(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    openSelectMenu('insight-type-select-test_insight');
    fireEvent.click(screen.getAllByRole('option').find((o) => o.textContent === 'Bar'));

    expect(setInsightType).toHaveBeenCalledWith('test_insight', 'bar');
  });

  it('renders SchemaEditor with droppable=true when expanded', async () => {
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const schemaEditor = await screen.findByTestId('schema-editor');
    expect(schemaEditor).toHaveAttribute('data-droppable', 'true');
  });

  it('does not render SchemaEditor when collapsed', async () => {
    render(
      <InsightCRUDSection
        insightName="test_insight"
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    // Wait for the always-rendered header so the schema-fetch effect settles
    // before we assert the absence of the schema editor.
    await screen.findByTestId('insight-header-test_insight');
    expect(screen.queryByTestId('schema-editor')).not.toBeInTheDocument();
  });

  it('collapse/expand toggle works', async () => {
    const onToggleExpand = jest.fn();

    render(
      <InsightCRUDSection
        insightName="test_insight"
        isExpanded={true}
        onToggleExpand={onToggleExpand}
      />
    );

    const toggleButton = await screen.findByTestId('insight-toggle-test_insight');
    fireEvent.click(toggleButton);

    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('remove button calls removeInsightFromChart', async () => {
    const removeInsightFromChart = jest.fn();
    useStore.setState({ removeInsightFromChart });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const removeButton = await screen.findByTestId('insight-remove-test_insight');
    fireEvent.click(removeButton);

    expect(removeInsightFromChart).toHaveBeenCalledWith('test_insight');
  });

  it('status dot renders green for new insight', async () => {
    useStore.setState({ explorerDiffResult: { insights: { test_insight: 'new' } } });
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const statusDot = await screen.findByTestId('insight-status-dot-test_insight');
    expect(statusDot.className).toContain('bg-green-500');
  });

  it('does not render status dot when not new and unchanged', async () => {
    useStore.setState({
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          isNew: false,
        },
      },
      explorerDiffResult: { insights: { test_insight: null } },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    await screen.findByTestId('insight-header-test_insight');
    expect(screen.queryByTestId('insight-status-dot-test_insight')).not.toBeInTheDocument();
  });

  it('shows amber status dot when insight is modified', async () => {
    useStore.setState({
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          isNew: false,
          type: 'bar',
        },
      },
      explorerDiffResult: { insights: { test_insight: 'modified' } },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const dot = await screen.findByTestId('insight-status-dot-test_insight');
    expect(dot.className).toContain('bg-amber-500');
  });

  it('renders interactions section with add button when expanded', async () => {
    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    expect(await screen.findByTestId('insight-add-interaction-test_insight')).toBeInTheDocument();
  });

  it('renders existing interactions', async () => {
    useStore.setState({
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          interactions: [
            { type: 'filter', value: 'some_filter_value' },
            { type: 'sort', value: 'some_sort_value' },
          ],
        },
      },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    await screen.findByTestId('insight-interaction-0');
    const interactions = screen.getAllByTestId(/^insight-interaction-/);
    expect(interactions.length).toBe(2);
  });

  it('add interaction button calls addInsightInteraction', async () => {
    const addInsightInteraction = jest.fn();
    useStore.setState({ addInsightInteraction });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    fireEvent.click(await screen.findByTestId('insight-add-interaction-test_insight'));
    expect(addInsightInteraction).toHaveBeenCalledWith('test_insight', {
      type: 'filter',
      value: '',
    });
  });

  it('remove interaction button calls removeInsightInteraction', async () => {
    const removeInsightInteraction = jest.fn();
    useStore.setState({
      removeInsightInteraction,
      explorerInsightStates: {
        test_insight: {
          ...defaultInsightState,
          interactions: [{ type: 'filter', value: 'val' }],
        },
      },
    });

    render(
      <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
    );

    const removeBtn = await screen.findByTestId('insight-remove-interaction-0');
    fireEvent.click(removeBtn);
    expect(removeInsightInteraction).toHaveBeenCalledWith('test_insight', 0);
  });

  it('clicking header sets active insight', async () => {
    const setActiveInsight = jest.fn();
    useStore.setState({ setActiveInsight });

    render(
      <InsightCRUDSection
        insightName="test_insight"
        isExpanded={false}
        onToggleExpand={jest.fn()}
      />
    );

    const header = await screen.findByTestId('insight-header-test_insight');
    fireEvent.click(header);

    expect(setActiveInsight).toHaveBeenCalledWith('test_insight');
  });

  it('renders nothing when insight state does not exist', async () => {
    useStore.setState({
      explorerInsightStates: {},
    });

    render(
      <InsightCRUDSection
        insightName="nonexistent"
        isExpanded={true}
        onToggleExpand={jest.fn()}
      />
    );

    // Component returns null, so there's no element to findBy. waitFor wraps
    // the assertion in act() and lets the schema-fetch effect settle.
    await waitFor(() => {
      expect(screen.queryByTestId('insight-crud-section-nonexistent')).not.toBeInTheDocument();
    });
  });

  describe('schema property changes', () => {
    it('sets changed and added props, and removes missing props', async () => {
      const setInsightProp = jest.fn();
      const removeInsightProp = jest.fn();
      setupStore({
        setInsightProp,
        removeInsightProp,
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            props: { x: 'old_x', y: 'old_y' },
          },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      capturedSchemaOnChange({ x: 'old_x', y: 'new_y', z: 'brand_new' });

      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'y', 'new_y');
      expect(setInsightProp).toHaveBeenCalledWith('test_insight', 'z', 'brand_new');
      expect(setInsightProp).not.toHaveBeenCalledWith('test_insight', 'x', expect.anything());
      expect(removeInsightProp).not.toHaveBeenCalled();
    });

    it('removes props omitted from the new value', async () => {
      const setInsightProp = jest.fn();
      const removeInsightProp = jest.fn();
      setupStore({
        setInsightProp,
        removeInsightProp,
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            props: { x: 'keep', y: 'drop' },
          },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      capturedSchemaOnChange({ x: 'keep' });

      expect(removeInsightProp).toHaveBeenCalledWith('test_insight', 'y');
      expect(setInsightProp).not.toHaveBeenCalled();
    });

    it('ignores null and non-object schema values', async () => {
      const setInsightProp = jest.fn();
      const removeInsightProp = jest.fn();
      setupStore({ setInsightProp, removeInsightProp });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      capturedSchemaOnChange(null);
      capturedSchemaOnChange('not-an-object');

      expect(setInsightProp).not.toHaveBeenCalled();
      expect(removeInsightProp).not.toHaveBeenCalled();
    });
  });

  describe('interaction rows', () => {
    it('changing the interaction type calls updateInsightInteraction', async () => {
      const updateInsightInteraction = jest.fn();
      setupStore({
        updateInsightInteraction,
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            interactions: [{ type: 'filter', value: '' }],
          },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      openSelectMenu('interaction-type-select-0');
      fireEvent.click(screen.getAllByRole('option').find((o) => o.textContent === 'Sort'));

      expect(updateInsightInteraction).toHaveBeenCalledWith('test_insight', 0, { type: 'sort' });
    });

    it('unwraps ?{...} interaction values for editing', async () => {
      setupStore({
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            interactions: [{ type: 'filter', value: '?{${ref(model).x} > 5}' }],
          },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      expect(screen.getByTestId('mock-ref-textarea')).toHaveValue('${ref(model).x} > 5');
    });

    it('shows non-wrapped interaction values as-is', async () => {
      setupStore({
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            interactions: [{ type: 'filter', value: 'raw_value' }],
          },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      expect(screen.getByTestId('mock-ref-textarea')).toHaveValue('raw_value');
    });

    it('wraps edited interaction values in ?{} on change', async () => {
      const updateInsightInteraction = jest.fn();
      setupStore({
        updateInsightInteraction,
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            interactions: [{ type: 'filter', value: '' }],
          },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.change(screen.getByTestId('mock-ref-textarea'), {
        target: { value: '${ref(m).col} = 1' },
      });

      expect(updateInsightInteraction).toHaveBeenCalledWith('test_insight', 0, {
        value: '?{${ref(m).col} = 1}',
      });
    });

    it('clearing an interaction value stores an empty string, not ?{}', async () => {
      const updateInsightInteraction = jest.fn();
      setupStore({
        updateInsightInteraction,
        explorerInsightStates: {
          test_insight: {
            ...defaultInsightState,
            interactions: [{ type: 'filter', value: '?{something}' }],
          },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.change(screen.getByTestId('mock-ref-textarea'), { target: { value: '' } });

      expect(updateInsightInteraction).toHaveBeenCalledWith('test_insight', 0, { value: '' });
    });
  });

  describe('rename flow', () => {
    it('clicking the name of a new insight opens the rename input', async () => {
      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));

      expect(screen.getByTestId('insight-rename-input-test_insight')).toHaveValue('test_insight');
    });

    it('clicking the name of a loaded (non-new) insight does not open rename', async () => {
      setupStore({
        explorerInsightStates: {
          test_insight: { ...defaultInsightState, isNew: false },
        },
      });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));

      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('commits rename on Enter', async () => {
      const renameInsight = jest.fn();
      setupStore({ renameInsight });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: '  renamed_insight  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(renameInsight).toHaveBeenCalledWith('test_insight', 'renamed_insight');
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('commits rename on blur', async () => {
      const renameInsight = jest.fn();
      setupStore({ renameInsight });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'blurred_name' } });
      fireEvent.blur(input);

      expect(renameInsight).toHaveBeenCalledWith('test_insight', 'blurred_name');
    });

    it('closes without renaming when the name is unchanged', async () => {
      const renameInsight = jest.fn();
      setupStore({ renameInsight });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(renameInsight).not.toHaveBeenCalled();
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('closes without renaming when the name is empty', async () => {
      const renameInsight = jest.fn();
      setupStore({ renameInsight });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(renameInsight).not.toHaveBeenCalled();
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
    });

    it('Escape cancels the rename without committing', async () => {
      const renameInsight = jest.fn();
      setupStore({ renameInsight });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'discarded' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(renameInsight).not.toHaveBeenCalled();
      expect(screen.queryByTestId('insight-rename-input-test_insight')).not.toBeInTheDocument();
      // Displayed name is unchanged
      expect(screen.getByTestId('insight-name-test_insight')).toHaveTextContent('test_insight');
    });

    it('shows a collision error and stays in rename mode when the name is taken', async () => {
      const renameInsight = jest.fn(() => {
        const err = new Error('Name "dupe" is already in use by a model. Choose a different name.');
        err.code = 'NAME_COLLISION';
        throw err;
      });
      setupStore({ renameInsight });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'dupe' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(screen.getByTestId('insight-rename-error-test_insight')).toHaveTextContent(
        'already in use by a model'
      );
      expect(screen.getByTestId('insight-rename-input-test_insight')).toBeInTheDocument();
    });

    it('typing after a collision clears the error', async () => {
      const renameInsight = jest.fn(() => {
        const err = new Error('Name "dupe" is already in use. Choose a different name.');
        err.code = 'NAME_COLLISION';
        throw err;
      });
      setupStore({ renameInsight });

      await renderSettled(
        <InsightCRUDSection insightName="test_insight" isExpanded={true} onToggleExpand={jest.fn()} />
      );

      fireEvent.click(screen.getByTestId('insight-name-test_insight'));
      const input = screen.getByTestId('insight-rename-input-test_insight');
      fireEvent.change(input, { target: { value: 'dupe' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByTestId('insight-rename-error-test_insight')).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'dupe_2' } });
      expect(
        screen.queryByTestId('insight-rename-error-test_insight')
      ).not.toBeInTheDocument();
    });
  });
});
