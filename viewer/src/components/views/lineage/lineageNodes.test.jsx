/* eslint-disable no-template-curly-in-string, testing-library/no-node-access, testing-library/no-container */
/**
 * Shared behaviour tests for the lineage React Flow node renderers.
 *
 * Every node renderer shares the same contract: it renders the object name,
 * the type icon + colors from objectTypeConfigs (single source of truth),
 * reactflow connection handles, a status indicator for new/modified objects,
 * and a highlight treatment when selected or being edited. The registry below
 * drives those shared assertions via describe.each, and node-specific
 * affordances (SQL previews, embedded pills, subtitles) get their own blocks.
 *
 * reactflow's <Handle> is mocked (it requires a live ReactFlow node context);
 * objectTypeConfigs is intentionally NOT mocked so the assertions pin the real
 * palette + icon wiring.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { getTypeByValue } from '../common/objectTypeConfigs';
import { ObjectStatus } from '../../../stores/store';
import SourceNode from './SourceNode';
import ModelNode from './ModelNode';
import CsvScriptModelNode from './CsvScriptModelNode';
import LocalMergeModelNode from './LocalMergeModelNode';
import DimensionNode from './DimensionNode';
import MetricNode from './MetricNode';
import RelationNode from './RelationNode';
import InsightNode from './InsightNode';
import MarkdownNode from './MarkdownNode';
import InputNode from './InputNode';
import ChartNode from './ChartNode';
import TableNode from './TableNode';
import DashboardNode from './DashboardNode';

// reactflow's <Handle> requires a live ReactFlow node context — stub it with a
// span that surfaces the handle type + resolved position for assertion.
// (jest.mock is hoisted above the imports, so the node modules see the stub.)
jest.mock('reactflow', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    Handle: ({ type, position }) =>
      mockReact.createElement('span', {
        'data-testid': `handle-${type}`,
        'data-position': position,
      }),
  };
});

const NODE_CASES = [
  { title: 'SourceNode', Component: SourceNode, typeValue: 'source' },
  { title: 'ModelNode', Component: ModelNode, typeValue: 'model' },
  { title: 'CsvScriptModelNode', Component: CsvScriptModelNode, typeValue: 'csvScriptModel' },
  { title: 'LocalMergeModelNode', Component: LocalMergeModelNode, typeValue: 'localMergeModel' },
  { title: 'DimensionNode', Component: DimensionNode, typeValue: 'dimension' },
  { title: 'MetricNode', Component: MetricNode, typeValue: 'metric' },
  { title: 'RelationNode', Component: RelationNode, typeValue: 'relation' },
  { title: 'InsightNode', Component: InsightNode, typeValue: 'insight' },
  { title: 'MarkdownNode', Component: MarkdownNode, typeValue: 'markdown' },
  { title: 'InputNode', Component: InputNode, typeValue: 'input' },
  { title: 'ChartNode', Component: ChartNode, typeValue: 'chart' },
  { title: 'TableNode', Component: TableNode, typeValue: 'table' },
  // Dashboards are pure sinks — they render no outgoing (source) handle.
  { title: 'DashboardNode', Component: DashboardNode, typeValue: 'dashboard', hasSourceHandle: false },
];

describe.each(NODE_CASES)('$title (shared node contract)', ({
  Component,
  typeValue,
  hasSourceHandle = true,
}) => {
  const colors = getTypeByValue(typeValue).colors;

  it('renders the object name with the default (unhighlighted) treatment and the type icon', () => {
    const { container } = render(<Component data={{ name: 'my_object' }} selected={false} />);

    const label = screen.getByText('my_object');
    expect(label.className).toContain('text-gray-800');
    expect(label.className).not.toContain(colors.text);

    // The type icon comes from objectTypeConfigs (an MUI svg).
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies the shared objectTypeConfigs highlight colors when selected', () => {
    const { container } = render(<Component data={{ name: 'my_object' }} selected />);

    // Name label switches to the type's text color.
    expect(screen.getByText('my_object').className).toContain(colors.text);

    // The wrapper takes the type's bg + selected border (no hand-rolled tones).
    const wrapper = container.firstChild;
    expect(wrapper.className).toContain(colors.bg);
    expect(wrapper.className).toContain(colors.borderSelected);

    // The type icon adopts the type text color too.
    const icon = container.querySelector('svg');
    expect(icon.getAttribute('class')).toContain(colors.text);
  });

  it('treats isEditing as highlighted even when not selected', () => {
    render(<Component data={{ name: 'my_object', isEditing: true }} selected={false} />);
    expect(screen.getByText('my_object').className).toContain(colors.text);
  });

  it(`renders a left target handle${hasSourceHandle ? ' and a right source handle' : ' and no source handle'}`, () => {
    render(<Component data={{ name: 'my_object' }} />);

    expect(screen.getByTestId('handle-target')).toHaveAttribute('data-position', 'left');

    const sourceHandles = screen.queryAllByTestId('handle-source');
    expect(sourceHandles).toHaveLength(hasSourceHandle ? 1 : 0);
    sourceHandles.forEach(handle => expect(handle).toHaveAttribute('data-position', 'right'));
  });

  it('shows a status indicator for new and modified objects, none when published', () => {
    const { rerender } = render(
      <Component data={{ name: 'my_object', status: ObjectStatus.NEW }} />
    );
    expect(screen.getByTitle('New - Not yet committed')).toBeInTheDocument();

    rerender(<Component data={{ name: 'my_object', status: ObjectStatus.MODIFIED }} />);
    expect(screen.getByTitle('Modified - Has uncommitted changes')).toBeInTheDocument();

    rerender(<Component data={{ name: 'my_object', status: ObjectStatus.PUBLISHED }} />);
    expect(screen.queryByTitle('New - Not yet committed')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Modified - Has uncommitted changes')).not.toBeInTheDocument();
  });
});

describe('SourceNode specifics', () => {
  it('renders the source type as a subtitle when provided', () => {
    render(<SourceNode data={{ name: 'db', type: 'duckdb' }} />);
    expect(screen.getByText('duckdb')).toBeInTheDocument();
  });

  it('omits the subtitle when no type is provided', () => {
    const { container } = render(<SourceNode data={{ name: 'db' }} />);
    expect(container.querySelector('.text-xs')).not.toBeInTheDocument();
  });
});

describe('InsightNode specifics', () => {
  it('renders the chart props type as a subtitle when provided', () => {
    render(<InsightNode data={{ name: 'rev', propsType: 'bar' }} />);
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('omits the subtitle when no propsType is provided', () => {
    const { container } = render(<InsightNode data={{ name: 'rev' }} />);
    expect(container.querySelector('.text-xs')).not.toBeInTheDocument();
  });
});

describe.each([
  { title: 'DimensionNode', Component: DimensionNode },
  { title: 'MetricNode', Component: MetricNode },
])('$title SQL preview', ({ Component }) => {
  it('shows short SQL in full with a title tooltip', () => {
    render(<Component data={{ name: 'obj', sql: 'SUM(amount)' }} />);
    const preview = screen.getByText('SUM(amount)');
    expect(preview).toHaveAttribute('title', 'SUM(amount)');
  });

  it('truncates SQL longer than 25 characters but keeps the full SQL in the tooltip', () => {
    const longSql = 'SELECT count(*) FROM a_very_long_table_name';
    render(<Component data={{ name: 'obj', sql: longSql }} />);
    const preview = screen.getByText(`${longSql.substring(0, 25)}...`);
    expect(preview).toHaveAttribute('title', longSql);
  });

  it('renders no SQL preview when sql is absent', () => {
    const { container } = render(<Component data={{ name: 'obj' }} />);
    expect(container.querySelector('.text-xs')).not.toBeInTheDocument();
  });
});

describe('RelationNode specifics', () => {
  it('renders the referenced model with an arrow and tooltip', () => {
    render(<RelationNode data={{ name: 'rel', model: 'users' }} />);
    const subtitle = screen.getByText('→ users');
    expect(subtitle).toHaveAttribute('title', '→ users');
  });

  it('omits the model line when no model is referenced', () => {
    const { container } = render(<RelationNode data={{ name: 'rel' }} />);
    expect(container.querySelector('.text-xs')).not.toBeInTheDocument();
  });
});

describe('ModelNode embedded types indicator', () => {
  it('shows a single-type indicator for an embedded (inline object) source', () => {
    const model = { name: 'users', config: { source: { type: 'duckdb' } } };
    render(<ModelNode data={{ name: 'users', model }} />);
    expect(screen.getByTitle('Contains embedded source')).toBeInTheDocument();
  });

  it('stacks multiple embedded types (source, dimension, metric)', () => {
    const model = {
      name: 'users',
      config: {
        source: { type: 'duckdb' },
        dimensions: [{ name: 'region' }],
        metrics: [{ name: 'total' }],
      },
    };
    render(<ModelNode data={{ name: 'users', model }} />);
    expect(
      screen.getByTitle('Contains embedded: source, dimension, metric')
    ).toBeInTheDocument();
  });

  it('shows no indicator when the source is a ref string', () => {
    const model = { name: 'users', config: { source: '${ref(db)}' } };
    render(<ModelNode data={{ name: 'users', model }} />);
    expect(screen.queryByTitle(/Contains embedded/)).not.toBeInTheDocument();
  });
});

describe('ChartNode embedded insights', () => {
  it('renders a pill per embedded insight object and skips ref strings and null entries', () => {
    const chart = {
      name: 'rev_chart',
      config: { insights: [{ name: 'inline_insight' }, '${ref(other_insight)}', null] },
    };
    render(<ChartNode data={{ name: 'rev_chart', chart }} />);

    // Only the inline object becomes a pill; the ref string and null do not.
    expect(screen.getByText('inline_insight')).toBeInTheDocument();
    expect(screen.queryByText('other_insight')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    // The embedded-types indicator flags the embedded insight.
    expect(screen.getByTitle('Contains embedded insight')).toBeInTheDocument();
  });

  it("labels an unnamed embedded insight as 'insight'", () => {
    const chart = { name: 'rev_chart', config: { insights: [{ props: { type: 'bar' } }] } };
    render(<ChartNode data={{ name: 'rev_chart', chart }} />);
    expect(screen.getByText('insight')).toBeInTheDocument();
  });

  it('renders no pills when the chart has no embedded insights', () => {
    render(<ChartNode data={{ name: 'rev_chart', chart: { name: 'rev_chart', config: {} } }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Contains embedded/)).not.toBeInTheDocument();
  });
});

describe('TableNode embedded data', () => {
  it('renders a pill for an embedded (inline object) data field', () => {
    const table = { name: 'rev_table', config: { data: { name: 'inline_data' } } };
    render(<TableNode data={{ name: 'rev_table', table }} />);
    expect(screen.getByText('inline_data')).toBeInTheDocument();
  });

  it("labels an unnamed embedded data object as 'data'", () => {
    const table = { name: 'rev_table', config: { data: { sql: 'SELECT 1' } } };
    render(<TableNode data={{ name: 'rev_table', table }} />);
    expect(screen.getByText('data')).toBeInTheDocument();
  });

  it('renders no pill when data is a ref string or absent', () => {
    const refTable = { name: 'rev_table', config: { data: '${ref(some_insight)}' } };
    const { rerender } = render(<TableNode data={{ name: 'rev_table', table: refTable }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<TableNode data={{ name: 'rev_table', table: { name: 'rev_table', config: {} } }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
