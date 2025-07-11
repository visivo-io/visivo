import { render, screen } from '@testing-library/react';
import Item, { getItemHeight, getItemWidth } from './Item';

// Mock the child components
jest.mock('./Chart', () => {
  return function MockChart({ chart, project, height, width, itemWidth }) {
    return (
      <div data-testid="chart">
        Chart: {chart.name} - {height}x{width} (itemWidth: {itemWidth})
      </div>
    );
  };
});

jest.mock('./Table', () => {
  return function MockTable({ table, project, height, width, itemWidth }) {
    return (
      <div data-testid="table">
        Table: {table.name} - {height}x{width} (itemWidth: {itemWidth})
      </div>
    );
  };
});

jest.mock('./Selector', () => {
  return function MockSelector({ selector, project, itemWidth }) {
    return (
      <div data-testid="selector">
        Selector: {selector.name} (itemWidth: {itemWidth})
      </div>
    );
  };
});

jest.mock('./Markdown', () => {
  return function MockMarkdown({ markdown, row, height }) {
    return (
      <div data-testid="markdown">
        Markdown: {markdown.markdown || 'content'} - height: {height}, row: {JSON.stringify(row)}
      </div>
    );
  };
});

describe('Item component', () => {
  const mockProject = {
    id: 'test-project',
    project_json: {},
  };

  test('renders chart item', () => {
    const chartItem = {
      chart: { name: 'test-chart' },
    };

    render(
      <Item
        item={chartItem}
        project={mockProject}
        height={400}
        width={600}
        itemWidth={2}
        rowIndex={1}
        itemIndex={2}
        keyPrefix="test"
      />
    );

    const chart = screen.getByTestId('chart');
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveTextContent('Chart: test-chart - 392x600 (itemWidth: 2)'); // height - 8 = 400 - 8 = 392
  });

  test('renders table item', () => {
    const tableItem = {
      table: { name: 'test-table' },
    };

    render(<Item item={tableItem} project={mockProject} height={500} width={800} itemWidth={1} />);

    const table = screen.getByTestId('table');
    expect(table).toBeInTheDocument();
    expect(table).toHaveTextContent('Table: test-table - 500x800 (itemWidth: 1)');
  });

  test('renders selector item', () => {
    const selectorItem = {
      selector: { name: 'test-selector' },
    };

    render(<Item item={selectorItem} project={mockProject} itemWidth={3} />);

    const selector = screen.getByTestId('selector');
    expect(selector).toBeInTheDocument();
    expect(selector).toHaveTextContent('Selector: test-selector (itemWidth: 3)');
  });

  test('renders markdown item', () => {
    const markdownItem = {
      markdown: '# Test Markdown',
      align: 'center',
      justify: 'between',
    };

    const mockRow = { height: 'medium' };

    render(<Item item={markdownItem} project={mockProject} height={300} row={mockRow} />);

    const markdown = screen.getByTestId('markdown');
    expect(markdown).toBeInTheDocument();
    expect(markdown).toHaveTextContent(
      'Markdown: # Test Markdown - height: 300, row: {"height":"medium"}'
    );
  });

  test('returns null for unknown item type', () => {
    const unknownItem = {
      unknown: { name: 'test' },
    };

    const { container } = render(<Item item={unknownItem} project={mockProject} />);

    expect(container.firstChild).toBeNull();
  });

  test('renders with specified row and item indices', () => {
    const chartItem = {
      chart: { name: 'test-chart' },
    };

    render(
      <Item
        item={chartItem}
        project={mockProject}
        rowIndex={5}
        itemIndex={3}
        keyPrefix="dashboard"
      />
    );

    // The key is passed to the component but not accessible in DOM
    // We can verify the component renders correctly with these props
    const chart = screen.getByTestId('chart');
    expect(chart).toBeInTheDocument();
  });

  test('uses default props when not provided', () => {
    const chartItem = {
      chart: { name: 'default-test' },
    };

    render(<Item item={chartItem} project={mockProject} />);

    const chart = screen.getByTestId('chart');
    expect(chart).toHaveTextContent('Chart: default-test - 388x600 (itemWidth: 1)'); // 396 - 8 = 388
  });
});

describe('getItemHeight utility', () => {
  test('returns correct heights for string values', () => {
    expect(getItemHeight('xsmall')).toBe(128);
    expect(getItemHeight('small')).toBe(256);
    expect(getItemHeight('medium')).toBe(396);
    expect(getItemHeight('large')).toBe(512);
    expect(getItemHeight('xlarge')).toBe(768);
    expect(getItemHeight('unknown')).toBe(1024);
  });
});

describe('getItemWidth utility', () => {
  test('returns container width when below breakpoint', () => {
    const containerWidth = 800;
    const widthBreakpoint = 1024;
    const items = [{ width: 1 }, { width: 2 }];
    const item = { width: 1 };

    const result = getItemWidth(containerWidth, widthBreakpoint, items, item);
    expect(result).toBe(800);
  });

  test('calculates proportional width when above breakpoint', () => {
    const containerWidth = 1200;
    const widthBreakpoint = 1024;
    const items = [{ width: 1 }, { width: 2 }, { width: 1 }]; // total width = 4
    const item = { width: 2 };

    const result = getItemWidth(containerWidth, widthBreakpoint, items, item);
    expect(result).toBe(600); // 1200 * (2/4) = 600
  });

  test('uses default width of 1 when item width is not specified', () => {
    const containerWidth = 1200;
    const widthBreakpoint = 1024;
    const items = [{ width: 1 }, {}, { width: 2 }]; // second item has no width, defaults to 1
    const item = {}; // no width specified, defaults to 1

    const result = getItemWidth(containerWidth, widthBreakpoint, items, item);
    expect(result).toBe(300); // 1200 * (1/4) = 300
  });

  test('handles empty items array', () => {
    const containerWidth = 1200;
    const widthBreakpoint = 1024;
    const items = [];
    const item = { width: 1 };

    const result = getItemWidth(containerWidth, widthBreakpoint, items, item);
    // When total width is 0, we return the full container width
    expect(result).toBe(1200);
  });
});
