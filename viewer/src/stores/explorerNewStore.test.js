/* eslint-disable no-template-curly-in-string */
import useStore from './store';
import {
  expandDotNotationProps,
  selectActiveModelState,
  selectActiveModelSql,
  selectActiveModelSourceName,
  selectActiveModelQueryResult,
  selectActiveModelQueryError,
  selectActiveModelComputedColumns,
  selectActiveModelEnrichedResult,
  selectActiveInsightConfig,
  selectModelStatus,
  selectInsightStatus,
  selectHasModifications,
} from './explorerNewStore';

// Helper to reset all explorer new state
const resetState = () => {
  useStore.setState({
    // Model Tab Management
    explorerModelTabs: [],
    explorerActiveModelName: null,

    // Per-Model State
    explorerModelStates: {},

    // Chart State
    explorerChartName: null,
    explorerChartLayout: {},
    explorerChartInsightNames: [],
    explorerActiveInsightName: null,

    // Per-Insight State
    explorerInsightStates: {},

    // DuckDB
    explorerDuckDBLoading: false,
    explorerDuckDBError: null,
    explorerFailedComputedColumns: {},

    // Sources
    explorerSources: [],

    // UI State
    explorerLeftNavCollapsed: false,
    explorerCenterMode: 'split',
    explorerProfileColumn: null,
    explorerIsEditorCollapsed: false,
  });
};

describe('explorerNewStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
  });

  // ====================================================================
  // expandDotNotationProps (exported utility)
  // ====================================================================
  describe('expandDotNotationProps', () => {
    it('passes through flat keys unchanged', () => {
      const result = expandDotNotationProps({ type: 'scatter', x: '?{${ref(m).col}}', y: '?{val}' });
      expect(result).toEqual({ type: 'scatter', x: '?{${ref(m).col}}', y: '?{val}' });
    });

    it('expands dot-notation keys to nested objects', () => {
      const result = expandDotNotationProps({ type: 'scatter', 'marker.color': '?{${ref(m).col}}' });
      expect(result).toEqual({ type: 'scatter', marker: { color: '?{${ref(m).col}}' } });
    });

    it('handles multiple dot levels', () => {
      const result = expandDotNotationProps({ 'marker.line.width': 2 });
      expect(result).toEqual({ marker: { line: { width: 2 } } });
    });

    it('returns empty object for empty input', () => {
      expect(expandDotNotationProps({})).toEqual({});
    });

    it('merges sibling dot-notation keys under same parent', () => {
      const result = expandDotNotationProps({
        'marker.color': 'red',
        'marker.size': 10,
      });
      expect(result).toEqual({ marker: { color: 'red', size: 10 } });
    });
  });

  // ====================================================================
  // Model Tab Actions
  // ====================================================================
  describe('createModelTab', () => {
    it('creates a model tab with auto-generated name when none provided', () => {
      useStore.getState().createModelTab();

      const state = useStore.getState();
      expect(state.explorerModelTabs).toHaveLength(1);
      expect(state.explorerModelTabs[0]).toBe('model');
      expect(state.explorerActiveModelName).toBe('model');
      expect(state.explorerModelStates.model).toBeDefined();
      expect(state.explorerModelStates.model.sql).toBe('');
      expect(state.explorerModelStates.model.queryResult).toBeNull();
      expect(state.explorerModelStates.model.queryError).toBeNull();
      expect(state.explorerModelStates.model.computedColumns).toEqual([]);
      expect(state.explorerModelStates.model.enrichedResult).toBeNull();
      expect(state.explorerModelStates.model.isNew).toBe(true);
    });

    it('defaults sourceName to project default source when available', () => {
      useStore.setState({
        defaults: { source_name: 'my-default-source' },
        explorerSources: [{ source_name: 'first-source' }],
      });

      useStore.getState().createModelTab();

      expect(useStore.getState().explorerModelStates.model.sourceName).toBe('my-default-source');
    });

    it('defaults sourceName to first available source when no project default', () => {
      useStore.setState({
        defaults: null,
        explorerSources: [{ source_name: 'first-source' }, { source_name: 'second-source' }],
      });

      useStore.getState().createModelTab();

      expect(useStore.getState().explorerModelStates.model.sourceName).toBe('first-source');
    });

    it('defaults sourceName to null when no sources available', () => {
      useStore.setState({ defaults: null, explorerSources: [] });

      useStore.getState().createModelTab();

      expect(useStore.getState().explorerModelStates.model.sourceName).toBeNull();
    });

    it('creates a model tab with a provided name', () => {
      useStore.getState().createModelTab('my_model');

      const state = useStore.getState();
      expect(state.explorerModelTabs).toEqual(['my_model']);
      expect(state.explorerActiveModelName).toBe('my_model');
      expect(state.explorerModelStates.my_model).toBeDefined();
    });

    it('generates unique name when name conflicts with existing tabs', () => {
      useStore.getState().createModelTab('model');
      useStore.getState().createModelTab('model');

      const state = useStore.getState();
      expect(state.explorerModelTabs).toEqual(['model', 'model_2']);
      expect(state.explorerActiveModelName).toBe('model_2');
    });

    it('switches active tab to the newly created tab', () => {
      useStore.getState().createModelTab('first');
      useStore.getState().createModelTab('second');

      expect(useStore.getState().explorerActiveModelName).toBe('second');
    });
  });

  describe('switchModelTab', () => {
    it('sets the active model name', () => {
      useStore.getState().createModelTab('model_a');
      useStore.getState().createModelTab('model_b');
      useStore.getState().switchModelTab('model_a');

      expect(useStore.getState().explorerActiveModelName).toBe('model_a');
    });
  });

  describe('closeModelTab', () => {
    it('removes the tab and its state', () => {
      useStore.getState().createModelTab('model_a');
      useStore.getState().createModelTab('model_b');
      useStore.getState().closeModelTab('model_a');

      const state = useStore.getState();
      expect(state.explorerModelTabs).toEqual(['model_b']);
      expect(state.explorerModelStates.model_a).toBeUndefined();
    });

    it('switches active tab to another tab when active tab is closed', () => {
      useStore.getState().createModelTab('model_a');
      useStore.getState().createModelTab('model_b');
      useStore.getState().switchModelTab('model_a');
      useStore.getState().closeModelTab('model_a');

      expect(useStore.getState().explorerActiveModelName).toBe('model_b');
    });

    it('sets active model to null when last tab is closed', () => {
      useStore.getState().createModelTab('only_model');
      useStore.getState().closeModelTab('only_model');

      expect(useStore.getState().explorerActiveModelName).toBeNull();
      expect(useStore.getState().explorerModelTabs).toEqual([]);
    });

    it('does not change active tab if closed tab is not active', () => {
      useStore.getState().createModelTab('model_a');
      useStore.getState().createModelTab('model_b');
      // model_b is active
      useStore.getState().closeModelTab('model_a');

      expect(useStore.getState().explorerActiveModelName).toBe('model_b');
    });
  });

  describe('renameModelTab', () => {
    it('renames the tab in tabs array and model states', () => {
      useStore.getState().createModelTab('old_name');

      useStore.getState().renameModelTab('old_name', 'new_name');

      const state = useStore.getState();
      expect(state.explorerModelTabs).toEqual(['new_name']);
      expect(state.explorerModelStates.old_name).toBeUndefined();
      expect(state.explorerModelStates.new_name).toBeDefined();
    });

    it('updates active model name if renamed tab is active', () => {
      useStore.getState().createModelTab('old_name');

      useStore.getState().renameModelTab('old_name', 'new_name');

      expect(useStore.getState().explorerActiveModelName).toBe('new_name');
    });

    it('does not rename if model is not new (isNew=false)', () => {
      useStore.getState().createModelTab('loaded_model');
      useStore.setState({
        explorerModelStates: {
          ...useStore.getState().explorerModelStates,
          loaded_model: {
            ...useStore.getState().explorerModelStates.loaded_model,
            isNew: false,
          },
        },
      });

      useStore.getState().renameModelTab('loaded_model', 'different_name');

      // Should not have renamed
      expect(useStore.getState().explorerModelTabs).toEqual(['loaded_model']);
      expect(useStore.getState().explorerModelStates.loaded_model).toBeDefined();
    });

    it('propagates rename through all insight props replacing ref(oldName) with ref(newName)', () => {
      useStore.getState().createModelTab('old_model');
      useStore.setState({
        explorerInsightStates: {
          insight_1: {
            type: 'scatter',
            props: {
              x: '?{${ref(old_model).col_a}}',
              y: '?{${ref(old_model).col_b}}',
              text: 'static_value',
            },
            interactions: [],
            typePropsCache: {},
            isNew: true,
          },
        },
        explorerChartInsightNames: ['insight_1'],
      });

      useStore.getState().renameModelTab('old_model', 'new_model');

      const insightState = useStore.getState().explorerInsightStates.insight_1;
      expect(insightState.props.x).toBe('?{${ref(new_model).col_a}}');
      expect(insightState.props.y).toBe('?{${ref(new_model).col_b}}');
      expect(insightState.props.text).toBe('static_value');
    });

    it('propagates rename through insight interaction values', () => {
      useStore.getState().createModelTab('old_model');
      useStore.setState({
        explorerInsightStates: {
          insight_1: {
            type: 'scatter',
            props: {},
            interactions: [
              { type: 'filter', value: '?{${ref(old_model).date} > ${ref(input_1)}}' },
            ],
            typePropsCache: {},
            isNew: true,
          },
        },
        explorerChartInsightNames: ['insight_1'],
      });

      useStore.getState().renameModelTab('old_model', 'new_model');

      const interaction = useStore.getState().explorerInsightStates.insight_1.interactions[0];
      expect(interaction.value).toBe('?{${ref(new_model).date} > ${ref(input_1)}}');
    });

    it('propagates rename through typePropsCache', () => {
      useStore.getState().createModelTab('old_model');
      useStore.setState({
        explorerInsightStates: {
          insight_1: {
            type: 'scatter',
            props: {},
            interactions: [],
            typePropsCache: {
              bar: { x: '?{${ref(old_model).col_a}}' },
            },
            isNew: true,
          },
        },
        explorerChartInsightNames: ['insight_1'],
      });

      useStore.getState().renameModelTab('old_model', 'new_model');

      const cache = useStore.getState().explorerInsightStates.insight_1.typePropsCache;
      expect(cache.bar.x).toBe('?{${ref(new_model).col_a}}');
    });
  });

  // ====================================================================
  // Active Model Convenience Actions
  // ====================================================================
  describe('setActiveModelSql', () => {
    it('sets sql on the active model', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelSql('SELECT 1');

      expect(useStore.getState().explorerModelStates.my_model.sql).toBe('SELECT 1');
    });

    it('does nothing if no active model', () => {
      useStore.getState().setActiveModelSql('SELECT 1');
      // Should not throw
      expect(useStore.getState().explorerActiveModelName).toBeNull();
    });
  });

  describe('setActiveModelSource', () => {
    it('sets sourceName on the active model', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelSource('postgres_db');

      expect(useStore.getState().explorerModelStates.my_model.sourceName).toBe('postgres_db');
    });
  });

  describe('setActiveModelQueryResult', () => {
    it('sets query result on active model and clears DuckDB state', () => {
      useStore.getState().createModelTab('my_model');
      useStore.setState({
        explorerDuckDBError: 'old error',
        explorerModelStates: {
          ...useStore.getState().explorerModelStates,
          my_model: {
            ...useStore.getState().explorerModelStates.my_model,
            enrichedResult: { columns: ['x'], rows: [] },
          },
        },
      });

      const mockResult = { columns: ['id'], rows: [{ id: 1 }], row_count: 1 };
      useStore.getState().setActiveModelQueryResult(mockResult);

      const state = useStore.getState();
      expect(state.explorerModelStates.my_model.queryResult).toEqual(mockResult);
      expect(state.explorerModelStates.my_model.queryError).toBeNull();
      expect(state.explorerModelStates.my_model.enrichedResult).toBeNull();
      expect(state.explorerDuckDBError).toBeNull();
      expect(state.explorerProfileColumn).toBeNull();
    });
  });

  describe('setActiveModelQueryError', () => {
    it('sets query error on the active model', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelQueryError('SQL syntax error');

      expect(useStore.getState().explorerModelStates.my_model.queryError).toBe('SQL syntax error');
    });
  });

  describe('addActiveModelComputedColumn', () => {
    it('adds a computed column to the active model', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().addActiveModelComputedColumn({
        name: 'total_revenue',
        expression: 'SUM(amount)',
        type: 'metric',
      });

      const cols = useStore.getState().explorerModelStates.my_model.computedColumns;
      expect(cols).toHaveLength(1);
      expect(cols[0].name).toBe('total_revenue');
    });

    it('prevents duplicate computed columns', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().addActiveModelComputedColumn({
        name: 'total',
        expression: 'SUM(amount)',
        type: 'metric',
      });
      useStore.getState().addActiveModelComputedColumn({
        name: 'total',
        expression: 'SUM(amount)',
        type: 'metric',
      });

      expect(useStore.getState().explorerModelStates.my_model.computedColumns).toHaveLength(1);
    });
  });

  describe('updateActiveModelComputedColumn', () => {
    it('updates a computed column on the active model and clears enriched result', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().addActiveModelComputedColumn({
        name: 'total',
        expression: 'SUM(x)',
        type: 'metric',
      });
      // Set an enriched result to verify it gets cleared
      useStore.setState({
        explorerModelStates: {
          ...useStore.getState().explorerModelStates,
          my_model: {
            ...useStore.getState().explorerModelStates.my_model,
            enrichedResult: { columns: ['x'], rows: [] },
          },
        },
      });

      useStore.getState().updateActiveModelComputedColumn('total', { expression: 'SUM(amount)' });

      const modelState = useStore.getState().explorerModelStates.my_model;
      expect(modelState.computedColumns[0].expression).toBe('SUM(amount)');
      expect(modelState.enrichedResult).toBeNull();
    });
  });

  describe('removeActiveModelComputedColumn', () => {
    it('removes a computed column and clears enriched result', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().addActiveModelComputedColumn({
        name: 'total',
        expression: 'SUM(x)',
        type: 'metric',
      });
      useStore.getState().addActiveModelComputedColumn({
        name: 'month',
        expression: "DATE_TRUNC('month', date)",
        type: 'dimension',
      });

      useStore.getState().removeActiveModelComputedColumn('total');

      const modelState = useStore.getState().explorerModelStates.my_model;
      expect(modelState.computedColumns).toHaveLength(1);
      expect(modelState.computedColumns[0].name).toBe('month');
      expect(modelState.enrichedResult).toBeNull();
    });
  });

  describe('setActiveModelEnrichedResult', () => {
    it('sets enriched result on the active model', () => {
      useStore.getState().createModelTab('my_model');
      const enriched = { columns: ['x', 'sum_x'], rows: [{ x: 1, sum_x: 10 }] };
      useStore.getState().setActiveModelEnrichedResult(enriched);

      expect(useStore.getState().explorerModelStates.my_model.enrichedResult).toEqual(enriched);
    });
  });

  // ====================================================================
  // Insight Actions
  // ====================================================================
  describe('createInsight', () => {
    it('creates an insight with auto-generated name', () => {
      useStore.getState().createInsight();

      const state = useStore.getState();
      expect(state.explorerChartInsightNames).toEqual(['insight']);
      expect(state.explorerActiveInsightName).toBe('insight');
      expect(state.explorerInsightStates.insight).toBeDefined();
      expect(state.explorerInsightStates.insight.type).toBe('scatter');
      expect(state.explorerInsightStates.insight.props).toEqual({});
      expect(state.explorerInsightStates.insight.interactions).toEqual([]);
      expect(state.explorerInsightStates.insight.typePropsCache).toEqual({});
      expect(state.explorerInsightStates.insight.isNew).toBe(true);
    });

    it('creates an insight with a provided name', () => {
      useStore.getState().createInsight('my_insight');

      expect(useStore.getState().explorerChartInsightNames).toEqual(['my_insight']);
      expect(useStore.getState().explorerInsightStates.my_insight).toBeDefined();
    });

    it('generates unique name when conflicting', () => {
      useStore.getState().createInsight('insight');
      useStore.getState().createInsight('insight');

      expect(useStore.getState().explorerChartInsightNames).toEqual(['insight', 'insight_2']);
    });

    it('sets new insight as active', () => {
      useStore.getState().createInsight('first');
      useStore.getState().createInsight('second');

      expect(useStore.getState().explorerActiveInsightName).toBe('second');
    });
  });

  describe('removeInsightFromChart', () => {
    it('removes insight from chart insight names but keeps state', () => {
      useStore.getState().createInsight('ins_1');
      useStore.getState().createInsight('ins_2');

      useStore.getState().removeInsightFromChart('ins_1');

      const state = useStore.getState();
      expect(state.explorerChartInsightNames).toEqual(['ins_2']);
      // State is kept for potential undo
      expect(state.explorerInsightStates.ins_1).toBeDefined();
    });

    it('switches active insight when active one is removed', () => {
      useStore.getState().createInsight('ins_1');
      useStore.getState().createInsight('ins_2');
      useStore.setState({ explorerActiveInsightName: 'ins_1' });

      useStore.getState().removeInsightFromChart('ins_1');

      expect(useStore.getState().explorerActiveInsightName).toBe('ins_2');
    });

    it('sets active insight to null when last chart insight is removed', () => {
      useStore.getState().createInsight('only_insight');

      useStore.getState().removeInsightFromChart('only_insight');

      expect(useStore.getState().explorerActiveInsightName).toBeNull();
    });
  });

  describe('setActiveInsight', () => {
    it('sets the active insight name', () => {
      useStore.getState().createInsight('ins_1');
      useStore.getState().createInsight('ins_2');
      useStore.getState().setActiveInsight('ins_1');

      expect(useStore.getState().explorerActiveInsightName).toBe('ins_1');
    });
  });

  describe('setInsightType', () => {
    it('saves full props under old type and flattened leaf values in shared cache', () => {
      useStore.getState().createInsight('ins');
      useStore.setState({
        explorerInsightStates: {
          ...useStore.getState().explorerInsightStates,
          ins: {
            ...useStore.getState().explorerInsightStates.ins,
            type: 'scatter',
            props: { x: 'col_a', y: 'col_b', marker: { color: 'red' } },
          },
        },
      });

      useStore.getState().setInsightType('ins', 'bar');

      const insight = useStore.getState().explorerInsightStates.ins;
      expect(insight.type).toBe('bar');
      expect(insight.props).toEqual({});
      // Full props saved under scatter key (including nested objects)
      expect(insight.typePropsCache.scatter).toEqual({ x: 'col_a', y: 'col_b', marker: { color: 'red' } });
      // Shared cache has ALL leaf string values flattened (including nested paths)
      expect(insight.typePropsCache._shared).toEqual({ x: 'col_a', y: 'col_b', 'marker.color': 'red' });
    });

    it('restores exact props when switching back to previous type', () => {
      useStore.getState().createInsight('ins');
      useStore.setState({
        explorerInsightStates: {
          ...useStore.getState().explorerInsightStates,
          ins: {
            ...useStore.getState().explorerInsightStates.ins,
            type: 'scatter',
            props: { x: 'a', y: 'b', marker: { color: 'red' } },
            typePropsCache: {},
          },
        },
      });

      useStore.getState().setInsightType('ins', 'bar');
      expect(useStore.getState().explorerInsightStates.ins.props).toEqual({});

      useStore.getState().setInsightType('ins', 'scatter');
      expect(useStore.getState().explorerInsightStates.ins.props).toEqual({
        x: 'a', y: 'b', marker: { color: 'red' },
      });
    });

    it('restorePropsFromCache restores shared flat values for new types', () => {
      useStore.getState().createInsight('ins');
      useStore.setState({
        explorerInsightStates: {
          ...useStore.getState().explorerInsightStates,
          ins: {
            ...useStore.getState().explorerInsightStates.ins,
            type: 'bar',
            props: {},
            typePropsCache: { _shared: { x: 'col_a', y: 'col_b', mode: 'markers' } },
          },
        },
      });

      useStore.getState().restorePropsFromCache('ins', ['x', 'y']);

      const insight = useStore.getState().explorerInsightStates.ins;
      expect(insight.props.x).toBe('col_a');
      expect(insight.props.y).toBe('col_b');
      expect(insight.props.mode).toBeUndefined();
    });

    it('restorePropsFromCache skips when props already populated', () => {
      useStore.getState().createInsight('ins');
      useStore.setState({
        explorerInsightStates: {
          ...useStore.getState().explorerInsightStates,
          ins: {
            ...useStore.getState().explorerInsightStates.ins,
            type: 'scatter',
            props: { x: 'existing' },
            typePropsCache: { _shared: { x: 'cached', y: 'cached' } },
          },
        },
      });

      useStore.getState().restorePropsFromCache('ins', ['x', 'y']);
      expect(useStore.getState().explorerInsightStates.ins.props).toEqual({ x: 'existing' });
    });
  });

  describe('setInsightProp', () => {
    it('sets a prop at a dot-notation path', () => {
      useStore.getState().createInsight('ins');

      useStore.getState().setInsightProp('ins', 'x', 'col_a');

      expect(useStore.getState().explorerInsightStates.ins.props.x).toBe('col_a');
    });

    it('overwrites an existing prop value', () => {
      useStore.getState().createInsight('ins');
      useStore.getState().setInsightProp('ins', 'x', 'old');
      useStore.getState().setInsightProp('ins', 'x', 'new');

      expect(useStore.getState().explorerInsightStates.ins.props.x).toBe('new');
    });

    it('does not affect other props', () => {
      useStore.getState().createInsight('ins');
      useStore.getState().setInsightProp('ins', 'x', 'col_a');
      useStore.getState().setInsightProp('ins', 'y', 'col_b');

      const props = useStore.getState().explorerInsightStates.ins.props;
      expect(props.x).toBe('col_a');
      expect(props.y).toBe('col_b');
    });
  });

  describe('removeInsightProp', () => {
    it('removes a prop while keeping others', () => {
      useStore.getState().createInsight('ins');
      useStore.getState().setInsightProp('ins', 'x', 'col_a');
      useStore.getState().setInsightProp('ins', 'y', 'col_b');

      useStore.getState().removeInsightProp('ins', 'y');

      const props = useStore.getState().explorerInsightStates.ins.props;
      expect(props.x).toBe('col_a');
      expect(props.y).toBeUndefined();
    });
  });

  describe('addInsightInteraction', () => {
    it('adds an interaction to the insight', () => {
      useStore.getState().createInsight('ins');
      useStore.getState().addInsightInteraction('ins', { type: 'filter', value: 'x > 1' });

      expect(useStore.getState().explorerInsightStates.ins.interactions).toHaveLength(1);
      expect(useStore.getState().explorerInsightStates.ins.interactions[0]).toEqual({
        type: 'filter',
        value: 'x > 1',
      });
    });
  });

  describe('removeInsightInteraction', () => {
    it('removes an interaction by index', () => {
      useStore.getState().createInsight('ins');
      useStore.getState().addInsightInteraction('ins', { type: 'filter', value: 'a' });
      useStore.getState().addInsightInteraction('ins', { type: 'sort', value: 'b' });

      useStore.getState().removeInsightInteraction('ins', 0);

      const interactions = useStore.getState().explorerInsightStates.ins.interactions;
      expect(interactions).toHaveLength(1);
      expect(interactions[0]).toEqual({ type: 'sort', value: 'b' });
    });
  });

  // ====================================================================
  // Chart Actions
  // ====================================================================
  describe('setChartName', () => {
    it('sets the chart name', () => {
      useStore.getState().setChartName('my_chart');
      expect(useStore.getState().explorerChartName).toBe('my_chart');
    });
  });

  describe('setChartLayout', () => {
    it('merges layout updates with existing layout', () => {
      useStore.setState({ explorerChartLayout: { 'title.text': 'Old' } });

      useStore.getState().setChartLayout({ 'xaxis.title.text': 'X Axis' });

      expect(useStore.getState().explorerChartLayout).toEqual({
        'title.text': 'Old',
        'xaxis.title.text': 'X Axis',
      });
    });

    it('overwrites existing layout keys', () => {
      useStore.setState({ explorerChartLayout: { 'title.text': 'Old' } });

      useStore.getState().setChartLayout({ 'title.text': 'New' });

      expect(useStore.getState().explorerChartLayout).toEqual({ 'title.text': 'New' });
    });
  });

  // ====================================================================
  // Loading Actions
  // ====================================================================
  describe('loadModel', () => {
    it('creates a model tab from existing model object', () => {
      const model = {
        name: 'orders',
        config: {
          sql: 'SELECT * FROM orders',
          source: 'ref(local_sqlite)',
        },
      };

      useStore.setState({
        explorerSources: [{ source_name: 'local_sqlite' }],
      });

      useStore.getState().loadModel(model);

      const state = useStore.getState();
      expect(state.explorerModelTabs).toContain('orders');
      expect(state.explorerActiveModelName).toBe('orders');
      expect(state.explorerModelStates.orders.sql).toBe('SELECT * FROM orders');
      expect(state.explorerModelStates.orders.sourceName).toBe('local_sqlite');
      expect(state.explorerModelStates.orders.isNew).toBe(false);
    });

    it('does not create duplicate tab if model already loaded', () => {
      const model = {
        name: 'orders',
        config: { sql: 'SELECT * FROM orders' },
      };

      useStore.getState().loadModel(model);
      useStore.getState().loadModel(model);

      expect(useStore.getState().explorerModelTabs.filter((t) => t === 'orders')).toHaveLength(1);
    });

    it('switches to existing tab if model already loaded', () => {
      useStore.getState().loadModel({ name: 'orders', config: { sql: 'SELECT 1' } });
      useStore.getState().createModelTab('new_model');
      useStore.getState().loadModel({ name: 'orders', config: { sql: 'SELECT 1' } });

      expect(useStore.getState().explorerActiveModelName).toBe('orders');
    });

    it('uses query field if sql field is missing', () => {
      useStore.getState().loadModel({
        name: 'test',
        config: { query: 'SELECT 2' },
      });

      expect(useStore.getState().explorerModelStates.test.sql).toBe('SELECT 2');
    });

    it('strips ref() wrapper from source name', () => {
      useStore.setState({
        explorerSources: [{ source_name: 'postgres_db' }],
      });

      useStore.getState().loadModel({
        name: 'test',
        config: { sql: 'SELECT 1', source: 'ref(postgres_db)' },
      });

      expect(useStore.getState().explorerModelStates.test.sourceName).toBe('postgres_db');
    });

    it('matches source via suffix when exact match fails', () => {
      useStore.setState({
        explorerSources: [{ source_name: 'local-duckdb' }],
      });

      useStore.getState().loadModel({
        name: 'test',
        config: { sql: 'SELECT 1', source: 'ref(duckdb)' },
      });

      expect(useStore.getState().explorerModelStates.test.sourceName).toBe('local-duckdb');
    });

    it('falls back to project default source when model has no source', () => {
      useStore.setState({
        defaults: { source_name: 'my-default-source' },
        explorerSources: [{ source_name: 'first-source' }],
      });

      useStore.getState().loadModel({
        name: 'no_source_model',
        config: { sql: 'SELECT 1' },
      });

      expect(useStore.getState().explorerModelStates.no_source_model.sourceName).toBe(
        'my-default-source'
      );
    });

    it('falls back to first available source when model has no source and no project default', () => {
      useStore.setState({
        defaults: null,
        explorerSources: [{ source_name: 'first-source' }, { source_name: 'second-source' }],
      });

      useStore.getState().loadModel({
        name: 'no_source_model',
        config: { sql: 'SELECT 1' },
      });

      expect(useStore.getState().explorerModelStates.no_source_model.sourceName).toBe(
        'first-source'
      );
    });

    it('loads metrics and dimensions as computed columns', () => {
      useStore.setState({
        metrics: [
          {
            name: 'revenue',
            parentModel: 'orders',
            config: { expression: 'SUM(amount)', model: 'ref(orders)' },
          },
        ],
        dimensions: [
          {
            name: 'order_month',
            config: { expression: "DATE_TRUNC('month', date)", model: 'ref(orders)' },
          },
        ],
      });

      useStore.getState().loadModel({
        name: 'orders',
        config: { sql: 'SELECT * FROM orders', source: 'ref(src)' },
      });

      const computedCols = useStore.getState().explorerModelStates.orders.computedColumns;
      expect(computedCols).toHaveLength(2);
      expect(computedCols[0].name).toBe('revenue');
      expect(computedCols[0].type).toBe('metric');
      expect(computedCols[1].name).toBe('order_month');
      expect(computedCols[1].type).toBe('dimension');
    });

    it('handles model with no config gracefully', () => {
      useStore.getState().loadModel({ name: 'test' });
      // Should not throw — should not create a tab
      expect(useStore.getState().explorerModelTabs).toEqual([]);
    });
  });

  describe('loadChart', () => {
    it('populates chart state and creates model tabs and insights', () => {
      const chart = {
        name: 'sales_chart',
        config: {
          layout: { 'title.text': 'Sales' },
        },
      };

      const insights = [
        {
          name: 'sales_scatter',
          config: {
            type: 'scatter',
            props: { x: '?{${ref(orders).month}}', y: '?{${ref(orders).total}}' },
            interactions: [],
          },
          parentModels: ['orders'],
        },
        {
          name: 'revenue_line',
          config: {
            type: 'line',
            props: { x: '?{${ref(revenue).date}}', y: '?{${ref(revenue).amount}}' },
            interactions: [{ type: 'filter', value: '?{${ref(date_input)} > ...}' }],
          },
          parentModels: ['revenue'],
        },
      ];

      const models = [
        { name: 'orders', config: { sql: 'SELECT * FROM orders', source: 'ref(sqlite)' } },
        { name: 'revenue', config: { sql: 'SELECT * FROM revenue', source: 'ref(postgres)' } },
      ];

      useStore.setState({
        explorerSources: [
          { source_name: 'sqlite' },
          { source_name: 'postgres' },
        ],
        metrics: [],
        dimensions: [],
      });

      useStore.getState().loadChart(chart, insights, models);

      const state = useStore.getState();

      // Chart state
      expect(state.explorerChartName).toBe('sales_chart');
      expect(state.explorerChartLayout).toEqual({ 'title.text': 'Sales' });

      // Model tabs
      expect(state.explorerModelTabs).toContain('orders');
      expect(state.explorerModelTabs).toContain('revenue');
      expect(state.explorerActiveModelName).toBe('orders'); // first model

      // Insight states
      expect(state.explorerChartInsightNames).toEqual(['sales_scatter', 'revenue_line']);
      expect(state.explorerInsightStates.sales_scatter).toBeDefined();
      expect(state.explorerInsightStates.sales_scatter.type).toBe('scatter');
      expect(state.explorerInsightStates.revenue_line.type).toBe('line');
      expect(state.explorerActiveInsightName).toBe('sales_scatter'); // first insight

      // Insight props
      expect(state.explorerInsightStates.sales_scatter.props).toEqual({
        x: '?{${ref(orders).month}}',
        y: '?{${ref(orders).total}}',
      });

      // Insight interactions
      expect(state.explorerInsightStates.revenue_line.interactions).toEqual([
        { type: 'filter', value: '?{${ref(date_input)} > ...}' },
      ]);

      // Loaded insights are not new
      expect(state.explorerInsightStates.sales_scatter.isNew).toBe(false);
    });

    it('does not create duplicate model tabs for insights sharing the same model', () => {
      const chart = { name: 'chart', config: { layout: {} } };
      const insights = [
        { name: 'ins_1', config: { type: 'scatter', props: {}, interactions: [] }, parentModels: ['orders'] },
        { name: 'ins_2', config: { type: 'bar', props: {}, interactions: [] }, parentModels: ['orders'] },
      ];
      const models = [
        { name: 'orders', config: { sql: 'SELECT 1' } },
      ];

      useStore.setState({ metrics: [], dimensions: [] });
      useStore.getState().loadChart(chart, insights, models);

      expect(useStore.getState().explorerModelTabs.filter((t) => t === 'orders')).toHaveLength(1);
    });
  });

  describe('handleTableSelect', () => {
    it('sets SQL and source on the active model when SQL is empty', () => {
      useStore.getState().createModelTab('my_model');

      useStore.getState().handleTableSelect({ sourceName: 'pg', table: 'users' });

      const modelState = useStore.getState().explorerModelStates.my_model;
      expect(modelState.sql).toBe('SELECT * FROM "users"');
      expect(modelState.sourceName).toBe('pg');
    });

    it('replaces SQL (not appends) when SQL already exists', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelSql('SELECT * FROM orders');

      useStore.getState().handleTableSelect({ sourceName: 'pg', table: 'users' });

      expect(useStore.getState().explorerModelStates.my_model.sql).toBe('SELECT * FROM "users"');
    });

    it('creates a model tab if none exists', () => {
      useStore.getState().handleTableSelect({ sourceName: 'pg', table: 'users' });

      const state = useStore.getState();
      expect(state.explorerModelTabs).toHaveLength(1);
      expect(state.explorerModelStates[state.explorerActiveModelName].sql).toBe(
        'SELECT * FROM "users"'
      );
      expect(state.explorerModelStates[state.explorerActiveModelName].sourceName).toBe('pg');
    });

    it('keeps existing source if none provided', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelSource('existing_source');

      useStore.getState().handleTableSelect({ sourceName: null, table: 'users' });

      expect(useStore.getState().explorerModelStates.my_model.sourceName).toBe('existing_source');
    });
  });

  // ====================================================================
  // DuckDB Actions
  // ====================================================================
  describe('DuckDB actions', () => {
    it('sets DuckDB loading state', () => {
      useStore.getState().setExplorerDuckDBLoading(true);
      expect(useStore.getState().explorerDuckDBLoading).toBe(true);

      useStore.getState().setExplorerDuckDBLoading(false);
      expect(useStore.getState().explorerDuckDBLoading).toBe(false);
    });

    it('sets DuckDB error state', () => {
      useStore.getState().setExplorerDuckDBError('DuckDB error');
      expect(useStore.getState().explorerDuckDBError).toBe('DuckDB error');
    });

    it('sets and clears failed computed columns', () => {
      useStore.getState().setExplorerFailedComputedColumns({
        formatted_date: 'Type mismatch',
      });

      expect(useStore.getState().explorerFailedComputedColumns).toEqual({
        formatted_date: 'Type mismatch',
      });

      useStore.getState().setExplorerFailedComputedColumns({});
      expect(useStore.getState().explorerFailedComputedColumns).toEqual({});
    });
  });

  // ====================================================================
  // UI Actions
  // ====================================================================
  describe('UI actions', () => {
    it('sets explorer sources', () => {
      const sources = [{ source_name: 'pg' }, { source_name: 'mysql' }];
      useStore.getState().setExplorerSources(sources);
      expect(useStore.getState().explorerSources).toEqual(sources);
    });

    it('toggles left nav collapsed', () => {
      expect(useStore.getState().explorerLeftNavCollapsed).toBe(false);
      useStore.getState().toggleExplorerLeftNavCollapsed();
      expect(useStore.getState().explorerLeftNavCollapsed).toBe(true);
      useStore.getState().toggleExplorerLeftNavCollapsed();
      expect(useStore.getState().explorerLeftNavCollapsed).toBe(false);
    });

    it('sets center mode', () => {
      useStore.getState().setExplorerCenterMode('chart');
      expect(useStore.getState().explorerCenterMode).toBe('chart');
    });

    it('sets profile column', () => {
      useStore.getState().setExplorerProfileColumn('email');
      expect(useStore.getState().explorerProfileColumn).toBe('email');
    });

    it('toggles editor collapsed', () => {
      expect(useStore.getState().explorerIsEditorCollapsed).toBe(false);
      useStore.getState().toggleExplorerEditorCollapsed();
      expect(useStore.getState().explorerIsEditorCollapsed).toBe(true);
      useStore.getState().toggleExplorerEditorCollapsed();
      expect(useStore.getState().explorerIsEditorCollapsed).toBe(false);
    });
  });

  // ====================================================================
  // Edge Cases
  // ====================================================================
  describe('edge cases', () => {
    it('renameModelTab handles multiple insights referencing the same model', () => {
      useStore.getState().createModelTab('old_model');
      useStore.setState({
        explorerInsightStates: {
          ins_1: {
            type: 'scatter',
            props: { x: '?{${ref(old_model).a}}' },
            interactions: [],
            typePropsCache: {},
            isNew: true,
          },
          ins_2: {
            type: 'bar',
            props: { y: '?{${ref(old_model).b}}' },
            interactions: [],
            typePropsCache: {},
            isNew: true,
          },
        },
        explorerChartInsightNames: ['ins_1', 'ins_2'],
      });

      useStore.getState().renameModelTab('old_model', 'new_model');

      expect(useStore.getState().explorerInsightStates.ins_1.props.x).toBe(
        '?{${ref(new_model).a}}'
      );
      expect(useStore.getState().explorerInsightStates.ins_2.props.y).toBe(
        '?{${ref(new_model).b}}'
      );
    });

    it('active model convenience actions are no-ops when no active model', () => {
      // None of these should throw
      useStore.getState().setActiveModelSql('test');
      useStore.getState().setActiveModelSource('test');
      useStore.getState().setActiveModelQueryResult({});
      useStore.getState().setActiveModelQueryError('err');
      useStore.getState().addActiveModelComputedColumn({ name: 'x', expression: 'y', type: 'metric' });
      useStore.getState().updateActiveModelComputedColumn('x', {});
      useStore.getState().removeActiveModelComputedColumn('x');
      useStore.getState().setActiveModelEnrichedResult({});

      // State should be unchanged
      expect(useStore.getState().explorerModelStates).toEqual({});
    });

    it('insight actions on non-existent insight do not throw', () => {
      // These should be no-ops
      useStore.getState().setInsightType('nonexistent', 'bar');
      useStore.getState().setInsightProp('nonexistent', 'x', 'val');
      useStore.getState().removeInsightProp('nonexistent', 'x');
      useStore.getState().addInsightInteraction('nonexistent', {});
      useStore.getState().removeInsightInteraction('nonexistent', 0);

      expect(useStore.getState().explorerInsightStates).toEqual({});
    });

    it('closeModelTab on non-existent tab does not throw', () => {
      useStore.getState().closeModelTab('nonexistent');
      expect(useStore.getState().explorerModelTabs).toEqual([]);
    });

    it('renameModelTab prevents collision with existing tab name', () => {
      useStore.getState().createModelTab('model_a');
      useStore.getState().createModelTab('model_b');

      useStore.getState().renameModelTab('model_a', 'model_b');

      // Should not have renamed — model_b already exists
      expect(useStore.getState().explorerModelTabs).toEqual(['model_a', 'model_b']);
      expect(useStore.getState().explorerModelStates.model_a).toBeDefined();
    });

    it('loadChart called twice replaces insight states from first chart', () => {
      const chart1 = { name: 'chart_1', config: { layout: {} } };
      const chart2 = { name: 'chart_2', config: { layout: {} } };
      const insights1 = [
        { name: 'ins_from_chart_1', config: { type: 'scatter', props: {}, interactions: [] }, parentModels: ['m1'] },
      ];
      const insights2 = [
        { name: 'ins_from_chart_2', config: { type: 'bar', props: {}, interactions: [] }, parentModels: ['m2'] },
      ];
      const models1 = [{ name: 'm1', config: { sql: 'SELECT 1' } }];
      const models2 = [{ name: 'm2', config: { sql: 'SELECT 2' } }];

      useStore.setState({ metrics: [], dimensions: [] });
      useStore.getState().loadChart(chart1, insights1, models1);
      useStore.getState().loadChart(chart2, insights2, models2);

      const state = useStore.getState();
      // Second chart replaces first chart's insights
      expect(state.explorerChartInsightNames).toEqual(['ins_from_chart_2']);
      expect(state.explorerInsightStates.ins_from_chart_1).toBeUndefined();
      expect(state.explorerInsightStates.ins_from_chart_2).toBeDefined();
    });

    it('renameModelTab propagates through array-valued insight props', () => {
      useStore.getState().createModelTab('old_model');
      useStore.setState({
        explorerInsightStates: {
          ins_1: {
            type: 'scatter',
            props: {
              customdata: ['?{${ref(old_model).col_a}}', '?{${ref(old_model).col_b}}'],
            },
            interactions: [],
            typePropsCache: {},
            isNew: true,
          },
        },
        explorerChartInsightNames: ['ins_1'],
      });

      useStore.getState().renameModelTab('old_model', 'new_model');

      const props = useStore.getState().explorerInsightStates.ins_1.props;
      expect(props.customdata[0]).toBe('?{${ref(new_model).col_a}}');
      expect(props.customdata[1]).toBe('?{${ref(new_model).col_b}}');
    });
  });

  // ====================================================================
  // Selectors
  // ====================================================================
  describe('selectors', () => {
    it('selectActiveModelSql returns active model sql', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelSql('SELECT 1');

      expect(selectActiveModelSql(useStore.getState())).toBe('SELECT 1');
    });

    it('selectActiveModelSql returns empty string when no active model', () => {
      expect(selectActiveModelSql(useStore.getState())).toBe('');
    });

    it('selectActiveModelSourceName returns active model source', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelSource('pg');

      expect(selectActiveModelSourceName(useStore.getState())).toBe('pg');
    });

    it('selectActiveModelQueryResult returns active model query result', () => {
      useStore.getState().createModelTab('my_model');
      const result = { columns: ['id'], rows: [{ id: 1 }], row_count: 1 };
      useStore.getState().setActiveModelQueryResult(result);

      expect(selectActiveModelQueryResult(useStore.getState())).toEqual(result);
    });

    it('selectActiveModelQueryError returns active model query error', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().setActiveModelQueryError('SQL error');

      expect(selectActiveModelQueryError(useStore.getState())).toBe('SQL error');
    });

    it('selectActiveModelComputedColumns returns active model computed columns', () => {
      useStore.getState().createModelTab('my_model');
      useStore.getState().addActiveModelComputedColumn({
        name: 'total',
        expression: 'SUM(x)',
        type: 'metric',
      });

      expect(selectActiveModelComputedColumns(useStore.getState())).toHaveLength(1);
      expect(selectActiveModelComputedColumns(useStore.getState())[0].name).toBe('total');
    });

    it('selectActiveModelEnrichedResult returns active model enriched result', () => {
      useStore.getState().createModelTab('my_model');
      const enriched = { columns: ['x'], rows: [{ x: 1 }] };
      useStore.getState().setActiveModelEnrichedResult(enriched);

      expect(selectActiveModelEnrichedResult(useStore.getState())).toEqual(enriched);
    });

    it('selectActiveModelState returns null when no active model', () => {
      expect(selectActiveModelState(useStore.getState())).toBeNull();
    });

    it('selectActiveInsightConfig returns default when no active insight', () => {
      const config = selectActiveInsightConfig(useStore.getState());
      expect(config).toEqual({ name: '', props: { type: 'scatter' } });
    });

    it('selectActiveInsightConfig returns active insight config', () => {
      useStore.getState().createInsight('my_insight');
      useStore.getState().setInsightProp('my_insight', 'x', 'col_a');

      const config = selectActiveInsightConfig(useStore.getState());
      expect(config.name).toBe('my_insight');
      expect(config.props.type).toBe('scatter');
      expect(config.props.x).toBe('col_a');
    });
  });

  // ====================================================================
  // Status Detection Selectors
  // ====================================================================
  describe('selectModelStatus', () => {
    it('returns "new" for a new model with SQL content', () => {
      useStore.setState({
        explorerModelStates: {
          m1: { sql: 'SELECT 1', sourceName: null, computedColumns: [], isNew: true },
        },
      });
      expect(selectModelStatus('m1')(useStore.getState())).toBe('new');
    });

    it('returns null for a new model with empty SQL (auto-created default)', () => {
      useStore.setState({
        explorerModelStates: {
          m1: { sql: '', sourceName: null, computedColumns: [], isNew: true },
        },
      });
      expect(selectModelStatus('m1')(useStore.getState())).toBeNull();
    });

    it('returns null for a loaded model with no changes', () => {
      useStore.setState({
        explorerModelStates: {
          m1: {
            sql: 'SELECT 1',
            sourceName: 'pg',
            computedColumns: [{ name: 'total', expression: 'SUM(x)', type: 'metric' }],
            isNew: false,
            _originalSql: 'SELECT 1',
            _originalSourceName: 'pg',
            _originalComputedColumns: [{ name: 'total', expression: 'SUM(x)', type: 'metric' }],
          },
        },
      });
      expect(selectModelStatus('m1')(useStore.getState())).toBeNull();
    });

    it('returns "modified" when SQL has changed', () => {
      useStore.setState({
        explorerModelStates: {
          m1: {
            sql: 'SELECT 2',
            sourceName: 'pg',
            computedColumns: [],
            isNew: false,
            _originalSql: 'SELECT 1',
            _originalSourceName: 'pg',
            _originalComputedColumns: [],
          },
        },
      });
      expect(selectModelStatus('m1')(useStore.getState())).toBe('modified');
    });

    it('returns "modified" when source has changed', () => {
      useStore.setState({
        explorerModelStates: {
          m1: {
            sql: 'SELECT 1',
            sourceName: 'mysql',
            computedColumns: [],
            isNew: false,
            _originalSql: 'SELECT 1',
            _originalSourceName: 'pg',
            _originalComputedColumns: [],
          },
        },
      });
      expect(selectModelStatus('m1')(useStore.getState())).toBe('modified');
    });

    it('returns "modified" when computed columns have changed', () => {
      useStore.setState({
        explorerModelStates: {
          m1: {
            sql: 'SELECT 1',
            sourceName: 'pg',
            computedColumns: [{ name: 'total', expression: 'SUM(amount)', type: 'metric' }],
            isNew: false,
            _originalSql: 'SELECT 1',
            _originalSourceName: 'pg',
            _originalComputedColumns: [],
          },
        },
      });
      expect(selectModelStatus('m1')(useStore.getState())).toBe('modified');
    });

    it('returns null for non-existent model', () => {
      expect(selectModelStatus('nonexistent')(useStore.getState())).toBeNull();
    });
  });

  describe('selectInsightStatus', () => {
    it('returns "new" for a new insight', () => {
      useStore.setState({
        explorerInsightStates: {
          i1: { type: 'scatter', props: {}, isNew: true },
        },
      });
      expect(selectInsightStatus('i1')(useStore.getState())).toBe('new');
    });

    it('returns null for a loaded insight with no changes', () => {
      useStore.setState({
        explorerInsightStates: {
          i1: {
            type: 'scatter',
            props: { x: 'col_a' },
            interactions: [],
            isNew: false,
            _originalType: 'scatter',
            _originalProps: { x: 'col_a' },
            _originalInteractions: [],
          },
        },
      });
      expect(selectInsightStatus('i1')(useStore.getState())).toBeNull();
    });

    it('returns "modified" when type has changed', () => {
      useStore.setState({
        explorerInsightStates: {
          i1: {
            type: 'bar',
            props: {},
            isNew: false,
            _originalType: 'scatter',
            _originalProps: {},
          },
        },
      });
      expect(selectInsightStatus('i1')(useStore.getState())).toBe('modified');
    });

    it('returns "modified" when props have changed', () => {
      useStore.setState({
        explorerInsightStates: {
          i1: {
            type: 'scatter',
            props: { x: 'col_b' },
            isNew: false,
            _originalType: 'scatter',
            _originalProps: { x: 'col_a' },
          },
        },
      });
      expect(selectInsightStatus('i1')(useStore.getState())).toBe('modified');
    });

    it('returns null for non-existent insight', () => {
      expect(selectInsightStatus('nonexistent')(useStore.getState())).toBeNull();
    });
  });

  describe('selectHasModifications', () => {
    it('returns false when all objects are unchanged', () => {
      useStore.setState({
        explorerModelStates: {
          m1: {
            sql: 'SELECT 1',
            sourceName: 'pg',
            computedColumns: [],
            isNew: false,
            _originalSql: 'SELECT 1',
            _originalSourceName: 'pg',
            _originalComputedColumns: [],
          },
        },
        explorerInsightStates: {
          i1: {
            type: 'scatter',
            props: {},
            interactions: [],
            isNew: false,
            _originalType: 'scatter',
            _originalProps: {},
            _originalInteractions: [],
          },
        },
      });
      expect(selectHasModifications(useStore.getState())).toBe(false);
    });

    it('returns false when a new model has empty SQL (auto-created default)', () => {
      useStore.setState({
        explorerModelStates: {
          m1: { sql: '', sourceName: null, computedColumns: [], isNew: true },
        },
        explorerInsightStates: {},
      });
      expect(selectHasModifications(useStore.getState())).toBe(false);
    });

    it('returns true when a new model has SQL content', () => {
      useStore.setState({
        explorerModelStates: {
          m1: { sql: 'SELECT 1', sourceName: null, computedColumns: [], isNew: true },
        },
        explorerInsightStates: {},
      });
      expect(selectHasModifications(useStore.getState())).toBe(true);
    });

    it('returns true when any model has changed SQL', () => {
      useStore.setState({
        explorerModelStates: {
          m1: {
            sql: 'SELECT 2',
            sourceName: 'pg',
            computedColumns: [],
            isNew: false,
            _originalSql: 'SELECT 1',
            _originalSourceName: 'pg',
            _originalComputedColumns: [],
          },
        },
        explorerInsightStates: {},
      });
      expect(selectHasModifications(useStore.getState())).toBe(true);
    });

    it('returns true when any insight is new', () => {
      useStore.setState({
        explorerModelStates: {},
        explorerInsightStates: {
          i1: { type: 'scatter', props: {}, isNew: true },
        },
      });
      expect(selectHasModifications(useStore.getState())).toBe(true);
    });

    it('returns true when any insight has changed props', () => {
      useStore.setState({
        explorerModelStates: {},
        explorerInsightStates: {
          i1: {
            type: 'scatter',
            props: { x: 'new_col' },
            isNew: false,
            _originalType: 'scatter',
            _originalProps: { x: 'old_col' },
          },
        },
      });
      expect(selectHasModifications(useStore.getState())).toBe(true);
    });

    it('returns false when model and insight states are empty', () => {
      useStore.setState({
        explorerModelStates: {},
        explorerInsightStates: {},
      });
      expect(selectHasModifications(useStore.getState())).toBe(false);
    });
  });

  // ====================================================================
  // Original state snapshots in loadModel/loadChart
  // ====================================================================
  describe('loadModel snapshot fields', () => {
    it('sets _original* fields on loaded model state', () => {
      useStore.setState({
        explorerSources: [{ source_name: 'pg' }],
        metrics: [],
        dimensions: [],
      });

      useStore.getState().loadModel({
        name: 'orders',
        config: { sql: 'SELECT * FROM orders', source: 'ref(pg)' },
      });

      const modelState = useStore.getState().explorerModelStates.orders;
      expect(modelState._originalSql).toBe('SELECT * FROM orders');
      expect(modelState._originalSourceName).toBe('pg');
      expect(modelState._originalComputedColumns).toEqual([]);
    });
  });

  describe('loadChart snapshot fields', () => {
    it('sets _original* fields on loaded insight states', () => {
      const chart = { name: 'chart', config: { layout: {} } };
      const insights = [
        {
          name: 'ins_1',
          config: { type: 'bar', props: { x: 'col_a' }, interactions: [] },
        },
      ];
      const models = [{ name: 'm1', config: { sql: 'SELECT 1' } }];

      useStore.setState({ metrics: [], dimensions: [] });
      useStore.getState().loadChart(chart, insights, models);

      const insightState = useStore.getState().explorerInsightStates.ins_1;
      expect(insightState._originalType).toBe('bar');
      expect(insightState._originalProps).toEqual({ x: 'col_a' });
    });

    it('sets _original* fields on loaded model states via loadChart', () => {
      const chart = { name: 'chart', config: { layout: {} } };
      const insights = [
        { name: 'ins_1', config: { type: 'scatter', props: {}, interactions: [] } },
      ];
      const models = [{ name: 'm1', config: { sql: 'SELECT 1', source: 'ref(pg)' } }];

      useStore.setState({
        explorerSources: [{ source_name: 'pg' }],
        metrics: [],
        dimensions: [],
      });
      useStore.getState().loadChart(chart, insights, models);

      const modelState = useStore.getState().explorerModelStates.m1;
      expect(modelState._originalSql).toBe('SELECT 1');
      expect(modelState._originalSourceName).toBe('pg');
      expect(modelState._originalComputedColumns).toEqual([]);
    });
  });

  describe('loadChart interaction transformation', () => {
    it('transforms API interactions ({split: "..."}) to UI format ({type, value})', () => {
      const chart = { name: 'chart', config: { layout: {} } };
      const insights = [
        {
          name: 'ins_1',
          config: {
            type: 'bar',
            props: { x: 'col_a' },
            interactions: [
              { split: '?{${ref(model).col} > 5}' },
              { sort: '?{${ref(model).col} ASC}' },
              { filter: '?{${ref(model).col} = 1}' },
            ],
          },
        },
      ];
      const models = [{ name: 'm1', config: { sql: 'SELECT 1' } }];

      useStore.setState({ metrics: [], dimensions: [] });
      useStore.getState().loadChart(chart, insights, models);

      const insightState = useStore.getState().explorerInsightStates.ins_1;
      expect(insightState.interactions).toEqual([
        { type: 'split', value: '?{${ref(model).col} > 5}' },
        { type: 'sort', value: '?{${ref(model).col} ASC}' },
        { type: 'filter', value: '?{${ref(model).col} = 1}' },
      ]);
    });

    it('handles interactions already in UI format', () => {
      const chart = { name: 'chart', config: { layout: {} } };
      const insights = [
        {
          name: 'ins_1',
          config: {
            type: 'scatter',
            props: {},
            interactions: [{ type: 'filter', value: 'test' }],
          },
        },
      ];
      const models = [{ name: 'm1', config: { sql: 'SELECT 1' } }];

      useStore.setState({ metrics: [], dimensions: [] });
      useStore.getState().loadChart(chart, insights, models);

      expect(useStore.getState().explorerInsightStates.ins_1.interactions).toEqual([
        { type: 'filter', value: 'test' },
      ]);
    });

    it('loads chart layout into store', () => {
      const chart = {
        name: 'my_chart',
        config: { layout: { title: { text: 'My Chart Title' } } },
      };
      const insights = [
        { name: 'ins', config: { type: 'scatter', props: {}, interactions: [] } },
      ];
      const models = [{ name: 'm', config: { sql: 'SELECT 1' } }];

      useStore.setState({ metrics: [], dimensions: [] });
      useStore.getState().loadChart(chart, insights, models);

      expect(useStore.getState().explorerChartLayout).toEqual({
        title: { text: 'My Chart Title' },
      });
    });
  });

  // ====================================================================
  // saveExplorerObjects
  // ====================================================================
  describe('saveExplorerObjects', () => {
    let mockSaveModel, mockSaveInsight, mockSaveChart, mockSaveMetric, mockSaveDimension;

    beforeEach(() => {
      mockSaveModel = jest.fn().mockResolvedValue({ success: true });
      mockSaveInsight = jest.fn().mockResolvedValue({ success: true });
      mockSaveChart = jest.fn().mockResolvedValue({ success: true });
      mockSaveMetric = jest.fn().mockResolvedValue({ success: true });
      mockSaveDimension = jest.fn().mockResolvedValue({ success: true });

      jest.mock('../api/models', () => ({ saveModel: (...args) => mockSaveModel(...args) }));
      jest.mock('../api/insights', () => ({ saveInsight: (...args) => mockSaveInsight(...args) }));
      jest.mock('../api/charts', () => ({ saveChart: (...args) => mockSaveChart(...args) }));
      jest.mock('../api/metrics', () => ({ saveMetric: (...args) => mockSaveMetric(...args) }));
      jest.mock('../api/dimensions', () => ({
        saveDimension: (...args) => mockSaveDimension(...args),
      }));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('saves new models and marks them as published on success', async () => {
      useStore.setState({
        explorerModelStates: {
          new_model: {
            sql: 'SELECT 1',
            sourceName: 'pg',
            computedColumns: [],
            isNew: true,
          },
        },
        explorerInsightStates: {},
        explorerChartName: null,
        explorerChartLayout: {},
        explorerChartInsightNames: [],
      });

      const result = await useStore.getState().saveExplorerObjects();

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockSaveModel).toHaveBeenCalledWith('new_model', {
        sql: 'SELECT 1',
        source: 'ref(pg)',
      });

      // Verify post-save state updates
      const modelState = useStore.getState().explorerModelStates.new_model;
      expect(modelState.isNew).toBe(false);
      expect(modelState._originalSql).toBe('SELECT 1');
      expect(modelState._originalSourceName).toBe('pg');
    });

    it('skips unchanged models', async () => {
      useStore.setState({
        explorerModelStates: {
          stable_model: {
            sql: 'SELECT 1',
            sourceName: 'pg',
            computedColumns: [],
            isNew: false,
            _originalSql: 'SELECT 1',
            _originalSourceName: 'pg',
            _originalComputedColumns: [],
          },
        },
        explorerInsightStates: {},
        explorerChartName: null,
        explorerChartLayout: {},
        explorerChartInsightNames: [],
      });

      await useStore.getState().saveExplorerObjects();

      expect(mockSaveModel).not.toHaveBeenCalled();
    });

    it('saves modified insights and resets originals on success', async () => {
      useStore.setState({
        explorerModelStates: {},
        explorerInsightStates: {
          my_insight: {
            type: 'bar',
            props: { x: 'col_a' },
            interactions: [],
            isNew: false,
            _originalType: 'scatter',
            _originalProps: {},
          },
        },
        explorerChartName: null,
        explorerChartLayout: {},
        explorerChartInsightNames: [],
      });

      const result = await useStore.getState().saveExplorerObjects();

      expect(result.success).toBe(true);
      expect(mockSaveInsight).toHaveBeenCalledWith('my_insight', {
        type: 'bar',
        props: { x: 'col_a' },
      });

      const insightState = useStore.getState().explorerInsightStates.my_insight;
      expect(insightState.isNew).toBe(false);
      expect(insightState._originalType).toBe('bar');
      expect(insightState._originalProps).toEqual({ x: 'col_a' });
    });

    it('saves chart when chart name exists', async () => {
      useStore.setState({
        explorerModelStates: {},
        explorerInsightStates: {},
        explorerChartName: 'my_chart',
        explorerChartLayout: { title: 'Test' },
        explorerChartInsightNames: ['insight_1', 'insight_2'],
      });

      const result = await useStore.getState().saveExplorerObjects();

      expect(result.success).toBe(true);
      expect(mockSaveChart).toHaveBeenCalledWith('my_chart', {
        insights: ['ref(insight_1)', 'ref(insight_2)'],
        layout: { title: 'Test' },
      });
    });

    it('saves computed columns as metrics and dimensions', async () => {
      useStore.setState({
        explorerModelStates: {
          my_model: {
            sql: 'SELECT 1',
            sourceName: 'pg',
            computedColumns: [
              { name: 'total', expression: 'SUM(amount)', type: 'metric' },
              { name: 'month', expression: "DATE_TRUNC('month', date)", type: 'dimension' },
            ],
            isNew: true,
          },
        },
        explorerInsightStates: {},
        explorerChartName: null,
        explorerChartLayout: {},
        explorerChartInsightNames: [],
      });

      await useStore.getState().saveExplorerObjects();

      expect(mockSaveMetric).toHaveBeenCalledWith('total', {
        expression: 'SUM(amount)',
        model: 'ref(my_model)',
      });
      expect(mockSaveDimension).toHaveBeenCalledWith('month', {
        expression: "DATE_TRUNC('month', date)",
        model: 'ref(my_model)',
      });
    });

    it('returns errors and does not reset originals on failure', async () => {
      mockSaveModel.mockRejectedValue(new Error('Network error'));

      useStore.setState({
        explorerModelStates: {
          bad_model: {
            sql: 'SELECT 1',
            sourceName: 'pg',
            computedColumns: [],
            isNew: true,
          },
        },
        explorerInsightStates: {},
        explorerChartName: null,
        explorerChartLayout: {},
        explorerChartInsightNames: [],
      });

      const result = await useStore.getState().saveExplorerObjects();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        name: 'bad_model',
        type: 'model',
        error: 'Network error',
      });

      // Original state should NOT be reset
      const modelState = useStore.getState().explorerModelStates.bad_model;
      expect(modelState.isNew).toBe(true);
    });

    it('expands dot-notation props when saving insights', async () => {
      useStore.setState({
        explorerModelStates: {},
        explorerInsightStates: {
          dot_insight: {
            type: 'scatter',
            props: { 'marker.color': 'red', 'marker.size': 10, x: 'col_a' },
            interactions: [],
            isNew: true,
          },
        },
        explorerChartName: null,
        explorerChartLayout: {},
        explorerChartInsightNames: [],
      });

      await useStore.getState().saveExplorerObjects();

      expect(mockSaveInsight).toHaveBeenCalledWith('dot_insight', {
        type: 'scatter',
        props: { marker: { color: 'red', size: 10 }, x: 'col_a' },
      });
    });
  });
});
