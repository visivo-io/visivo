import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileStats from './ProfileStats';

const numericProfile = {
  null_percentage: 25,
  null_count: 5,
  distinct: 10,
  min: 1,
  max: 100,
  avg: 42.5,
  median: 40,
  std_dev: 12.25,
  q25: 20,
  q75: 60,
  type: 'BIGINT',
};

describe('ProfileStats', () => {
  it('renders nothing when profile is null', () => {
    const { container } = render(<ProfileStats profile={null} rowCount={10} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders data quality section with valid/null percentages', () => {
    render(<ProfileStats profile={numericProfile} rowCount={20} />);

    expect(screen.getByText('Data Quality')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
    expect(screen.getByTestId('valid-bar')).toHaveStyle({ width: '75%' });
    expect(screen.getByTestId('null-bar')).toHaveStyle({ width: '25%' });
  });

  it('omits the null bar segment when null percentage is zero', () => {
    render(
      <ProfileStats
        profile={{ ...numericProfile, null_percentage: 0, null_count: 0 }}
        rowCount={20}
      />
    );

    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.queryByTestId('null-bar')).not.toBeInTheDocument();
  });

  it('defaults null percentage and count to zero when missing from profile', () => {
    render(
      <ProfileStats
        profile={{ distinct: 3, min: null, avg: null }}
        rowCount={null}
      />
    );

    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.getByText('Null Count')).toBeInTheDocument();
    // null_count defaults to 0
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows non-null of total when rowCount is provided', () => {
    render(<ProfileStats profile={numericProfile} rowCount={20} />);

    expect(screen.getByText('Non-null')).toBeInTheDocument();
    expect(screen.getByText('15 of 20')).toBeInTheDocument();
  });

  it('hides non-null row when rowCount is not provided', () => {
    render(<ProfileStats profile={numericProfile} />);

    expect(screen.queryByText('Non-null')).not.toBeInTheDocument();
  });

  it('renders distinct count with locale formatting for large integers', () => {
    render(
      <ProfileStats profile={{ ...numericProfile, distinct: 1234567 }} rowCount={2000000} />
    );

    expect(screen.getByText((1234567).toLocaleString())).toBeInTheDocument();
  });

  it('renders range section for numeric min/max', () => {
    render(<ProfileStats profile={numericProfile} rowCount={20} />);

    expect(screen.getByText('Range')).toBeInTheDocument();
    expect(screen.getByText('Min')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('hides range section when min is null', () => {
    render(
      <ProfileStats profile={{ ...numericProfile, min: null }} rowCount={20} />
    );

    expect(screen.queryByText('Range')).not.toBeInTheDocument();
  });

  it('renders string min/max as-is for text columns', () => {
    render(
      <ProfileStats
        profile={{
          null_percentage: 0,
          null_count: 0,
          distinct: 2,
          min: 'apple',
          max: 'zebra',
          avg: null,
          type: 'VARCHAR',
        }}
        rowCount={2}
      />
    );

    expect(screen.getByText('apple')).toBeInTheDocument();
    expect(screen.getByText('zebra')).toBeInTheDocument();
  });

  it('formats DATE values with toLocaleDateString', () => {
    const value = '2024-01-15T12:00:00';
    render(
      <ProfileStats
        profile={{
          null_percentage: 0,
          null_count: 0,
          distinct: 2,
          min: value,
          max: value,
          avg: null,
          type: 'DATE',
        }}
        rowCount={2}
      />
    );

    const expected = new Date(value).toLocaleDateString();
    expect(screen.getAllByText(expected).length).toBe(2);
  });

  it('formats lowercase timestamp values with toLocaleString', () => {
    const value = '2024-01-15T12:30:00';
    render(
      <ProfileStats
        profile={{
          null_percentage: 0,
          null_count: 0,
          distinct: 1,
          min: value,
          max: value,
          avg: null,
          type: 'timestamp',
        }}
        rowCount={1}
      />
    );

    const expected = new Date(value).toLocaleString();
    expect(screen.getAllByText(expected).length).toBe(2);
  });

  it('falls back to raw string when a DATE value cannot be parsed', () => {
    render(
      <ProfileStats
        profile={{
          null_percentage: 0,
          null_count: 0,
          distinct: 1,
          min: 'not-a-date',
          max: 'not-a-date',
          avg: null,
          type: 'DATE',
        }}
        rowCount={1}
      />
    );

    expect(screen.getAllByText('not-a-date').length).toBe(2);
  });

  it('renders central tendency for numeric columns with fraction formatting', () => {
    render(<ProfileStats profile={numericProfile} rowCount={20} />);

    expect(screen.getByText('Central Tendency')).toBeInTheDocument();
    expect(screen.getByText('Mean')).toBeInTheDocument();
    expect(
      screen.getByText((42.5).toLocaleString(undefined, { maximumFractionDigits: 4 }))
    ).toBeInTheDocument();
    expect(
      screen.getByText((12.25).toLocaleString(undefined, { maximumFractionDigits: 4 }))
    ).toBeInTheDocument();
  });

  it('hides central tendency and percentiles for non-numeric columns', () => {
    render(
      <ProfileStats
        profile={{
          null_percentage: 0,
          null_count: 0,
          distinct: 2,
          min: 'a',
          max: 'b',
          avg: null,
          q25: null,
          type: 'VARCHAR',
        }}
        rowCount={2}
      />
    );

    expect(screen.queryByText('Central Tendency')).not.toBeInTheDocument();
    expect(screen.queryByText('Percentiles')).not.toBeInTheDocument();
  });

  it('renders percentiles when q25 is present', () => {
    render(<ProfileStats profile={numericProfile} rowCount={20} />);

    expect(screen.getByText('Percentiles')).toBeInTheDocument();
    expect(screen.getByText('25th')).toBeInTheDocument();
    expect(screen.getByText('50th')).toBeInTheDocument();
    expect(screen.getByText('75th')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('hides percentiles when q25 is null even for numeric columns', () => {
    render(
      <ProfileStats profile={{ ...numericProfile, q25: null }} rowCount={20} />
    );

    expect(screen.getByText('Central Tendency')).toBeInTheDocument();
    expect(screen.queryByText('Percentiles')).not.toBeInTheDocument();
  });

  it('renders em dash for null stat values', () => {
    render(
      <ProfileStats
        profile={{ ...numericProfile, median: null, std_dev: null, q25: 20 }}
        rowCount={20}
      />
    );

    // median renders as — in both Central Tendency and 50th percentile,
    // std_dev renders as — once.
    expect(screen.getAllByText('—').length).toBe(3);
  });
});
