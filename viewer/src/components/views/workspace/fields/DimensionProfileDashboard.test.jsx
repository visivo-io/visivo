/**
 * DimensionProfileDashboard tests.
 *
 * The dashboard-style column profile (KPI tiles + distribution chart with a
 * bin/top-N toggle + box-plot + quality bar) that replaced the table-style
 * ProfileStats list in the dimension Field Lens. We mock the one data dependency
 * — `histogramTableLocally` — and drive numeric vs categorical profiles.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DimensionProfileDashboard from './DimensionProfileDashboard';

const mockHistogram = jest.fn();
jest.mock('../../../../duckdb/profiling', () => ({
  __esModule: true,
  histogramTableLocally: (...a) => mockHistogram(...a),
}));

const db = { id: 'db' };

// avg present → numeric profile; absent → categorical.
const NUMERIC = {
  type: 'DOUBLE',
  distinct: 3,
  null_count: 0,
  null_percentage: 0,
  min: 1,
  max: 10,
  avg: 5,
  median: 5,
  std_dev: 2,
  q25: 3,
  q75: 7,
};
const CATEGORICAL = {
  type: 'VARCHAR',
  distinct: 4,
  null_count: 1,
  null_percentage: 10,
};

const renderDash = (profile, rowCount = 100) =>
  render(
    <DimensionProfileDashboard db={db} tableName="t" column="c" profile={profile} rowCount={rowCount} />
  );

describe('DimensionProfileDashboard', () => {
  beforeEach(() => {
    mockHistogram.mockReset();
    mockHistogram.mockResolvedValue({
      buckets: [
        { range: '[1, 2)', count: 5 },
        { range: '[2, 3)', count: 3 },
      ],
      total_count: 8,
      column_type: 'DOUBLE',
    });
  });

  it('renders the KPI tiles, spread + quality cards for a numeric profile', async () => {
    renderDash(NUMERIC);
    expect(screen.getByTestId('dimension-profile-dashboard')).toBeInTheDocument();
    ['dim-kpi-rows', 'dim-kpi-distinct', 'dim-kpi-null', 'dim-kpi-mean', 'dim-kpi-median', 'dim-kpi-std'].forEach(
      id => expect(screen.getByTestId(id)).toBeInTheDocument()
    );
    expect(screen.getByTestId('dim-spread-card')).toBeInTheDocument();
    expect(screen.getByTestId('dim-quality-card')).toBeInTheDocument();
    // The histogram is fetched once with the default 20 bins.
    await waitFor(() => expect(mockHistogram).toHaveBeenCalledWith(db, 't', 'c', 20));
    expect(await screen.findAllByTestId('dim-histogram-bar')).toHaveLength(2);
  });

  it('the bin toggle recomputes the histogram with the chosen bin count', async () => {
    renderDash(NUMERIC);
    await waitFor(() => expect(mockHistogram).toHaveBeenCalledWith(db, 't', 'c', 20));
    fireEvent.click(screen.getByTestId('dim-bins-toggle-50'));
    await waitFor(() => expect(mockHistogram).toHaveBeenCalledWith(db, 't', 'c', 50));
  });

  it('renders top-values + a top-N toggle (no spread/bins) for a categorical profile', async () => {
    mockHistogram.mockResolvedValue({
      buckets: [
        { value: 'A', count: 5 },
        { value: 'B', count: 3 },
      ],
      total_count: 8,
      column_type: 'VARCHAR',
    });
    renderDash(CATEGORICAL);
    // The control switches to top-N once the categorical histogram resolves.
    expect(await screen.findByTestId('dim-topn-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('dim-bins-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dim-spread-card')).not.toBeInTheDocument();
    expect(await screen.findAllByTestId('dim-category-row')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('dim-topn-toggle-20'));
    await waitFor(() => expect(mockHistogram).toHaveBeenCalledWith(db, 't', 'c', 20));
  });

  it('shows a muted note when the histogram has no buckets', async () => {
    mockHistogram.mockResolvedValue({ buckets: [], total_count: 0, column_type: 'DOUBLE' });
    renderDash(NUMERIC);
    expect(await screen.findByTestId('dim-distribution-empty')).toBeInTheDocument();
  });
});
