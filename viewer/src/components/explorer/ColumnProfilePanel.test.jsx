import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ColumnProfilePanel from './ColumnProfilePanel';

jest.mock('../../duckdb/profiling', () => ({
  histogramTableLocally: jest.fn(),
}));

const { histogramTableLocally } = require('../../duckdb/profiling');

const mockDb = {};

const numericProfile = {
  name: 'amount',
  type: 'DOUBLE',
  null_percentage: 12.5,
  null_count: 125,
  distinct: 950,
  min: 0.5,
  max: 9999.99,
  avg: 450.25,
  median: 320.0,
  std_dev: 210.5,
  q25: 100.0,
  q75: 700.0,
};

const stringProfile = {
  name: 'status',
  type: 'VARCHAR',
  null_percentage: 0,
  null_count: 0,
  distinct: 5,
  min: 'active',
  max: 'pending',
  avg: null,
  median: null,
  std_dev: null,
  q25: null,
  q75: null,
};

const defaultProps = {
  column: 'amount',
  profile: numericProfile,
  db: mockDb,
  tableName: 'test_table',
  rowCount: 1000,
  onClose: jest.fn(),
  isOpen: true,
};

describe('ColumnProfilePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders column name and type badge when open', () => {
    render(<ColumnProfilePanel {...defaultProps} />);
    expect(screen.getByText('amount')).toBeInTheDocument();
    expect(screen.getByText('DOUBLE')).toBeInTheDocument();
  });

  it('displays data quality statistics', () => {
    render(<ColumnProfilePanel {...defaultProps} />);
    expect(screen.getByText('Data Quality')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument(); // null pct
    expect(screen.getByText('87.5%')).toBeInTheDocument(); // valid pct
    expect(screen.getByText('125')).toBeInTheDocument(); // null count
    expect(screen.getByText('950')).toBeInTheDocument(); // distinct
  });

  it('shows null percentage visual bar with correct width', () => {
    render(<ColumnProfilePanel {...defaultProps} />);
    const validBar = screen.getByTestId('valid-bar');
    const nullBar = screen.getByTestId('null-bar');
    expect(validBar).toHaveStyle({ width: '87.5%' });
    expect(nullBar).toHaveStyle({ width: '12.5%' });
  });

  it('displays numeric statistics for numeric profiles', () => {
    render(<ColumnProfilePanel {...defaultProps} />);
    expect(screen.getByText('Central Tendency')).toBeInTheDocument();
    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(screen.getByText('Median')).toBeInTheDocument();
    expect(screen.getByText('Std Dev')).toBeInTheDocument();
    expect(screen.getByText('Percentiles')).toBeInTheDocument();
    expect(screen.getByText('25th')).toBeInTheDocument();
    expect(screen.getByText('75th')).toBeInTheDocument();
  });

  it('hides numeric sections for non-numeric profiles', () => {
    render(<ColumnProfilePanel {...defaultProps} column="status" profile={stringProfile} />);
    expect(screen.queryByText('Central Tendency')).not.toBeInTheDocument();
    expect(screen.queryByText('Percentiles')).not.toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<ColumnProfilePanel {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('does not render when profile is null', () => {
    const { container } = render(<ColumnProfilePanel {...defaultProps} profile={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('calls onClose when close button clicked', () => {
    const onClose = jest.fn();
    render(<ColumnProfilePanel {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close profile panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('loads and displays histogram on Show Distribution click', async () => {
    histogramTableLocally.mockResolvedValue({
      buckets: [
        { range: '[0, 100)', count: 200 },
        { range: '[100, 200)', count: 150 },
      ],
      total_count: 1000,
      column_type: 'DOUBLE',
    });

    render(<ColumnProfilePanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Show Distribution'));

    await waitFor(() => {
      expect(screen.getByText('Distribution')).toBeInTheDocument();
    });
    expect(histogramTableLocally).toHaveBeenCalledWith(mockDb, 'test_table', 'amount');
    expect(screen.getByText('[0, 100)')).toBeInTheDocument();
  });

  it('shows Show Top Values button text for string columns', () => {
    render(<ColumnProfilePanel {...defaultProps} column="status" profile={stringProfile} />);
    expect(screen.getByText('Show Top Values')).toBeInTheDocument();
  });

  it('shows error state when histogram fetch fails', async () => {
    histogramTableLocally.mockRejectedValue(new Error('Network error'));

    render(<ColumnProfilePanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Show Distribution'));

    await waitFor(() => {
      expect(screen.getByTestId('histogram-error')).toHaveTextContent('Network error');
    });
  });

  it('resets histogram when column prop changes', () => {
    const { rerender } = render(<ColumnProfilePanel {...defaultProps} />);
    // Switch to a different column
    rerender(<ColumnProfilePanel {...defaultProps} column="status" profile={stringProfile} />);
    // Histogram button should be fresh (not showing old data)
    expect(screen.getByText('Show Top Values')).toBeInTheDocument();
    expect(screen.queryByText('Distribution')).not.toBeInTheDocument();
  });

  it('Copy Stats button copies formatted stats to clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ColumnProfilePanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Copy Stats'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).toContain('Column: amount');
    expect(copiedText).toContain('Type: DOUBLE');
    expect(copiedText).toContain('Null %: 12.5%');
  });

  it('shows non-null count relative to total', () => {
    render(<ColumnProfilePanel {...defaultProps} />);
    expect(screen.getByText('875 of 1,000')).toBeInTheDocument();
  });
});
