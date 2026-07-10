/**
 * RecordRunStatus tests (VIS-993 §2 / VIS-981) — the compact per-record
 * run-failure banner for editing surfaces. Failures land ON the record whose
 * name appears in the failed run's dag_filter; a newer succeeded run mentioning
 * the same name clears it.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { futureFlags } from '../../../router-config';
import RecordRunStatus from './RecordRunStatus';
import useStore from '../../../stores/store';

const setRuns = runs => act(() => useStore.setState({ runs }));

const FAILED_RUN = {
  id: 'run-9',
  state: 'failed',
  dag_filter: '+revenue_insight+,+orders_model+',
  error_json: '{"message":"relation \\"orders\\" does not exist"}',
  is_superseded: false,
  created_at: '2026-07-01T12:00:00Z',
};

afterEach(() => setRuns([]));

describe('RecordRunStatus', () => {
  it('renders nothing when no failure applies to the record', () => {
    setRuns([]);
    const { container } = render(<RecordRunStatus name="revenue_insight" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('record-run-status')).not.toBeInTheDocument();
  });

  it('renders "Last run failed" + the extracted error when a failed run mentions the record', () => {
    setRuns([FAILED_RUN]);
    render(<RecordRunStatus name="revenue_insight" />);
    const banner = screen.getByTestId('record-run-status');
    expect(banner).toHaveTextContent('Last run failed');
    expect(banner).toHaveTextContent('relation "orders" does not exist');
  });

  it('exposes the full error via the title attribute (truncated display, expandable)', () => {
    setRuns([FAILED_RUN]);
    render(<RecordRunStatus name="orders_model" />);
    expect(screen.getByTitle('relation "orders" does not exist')).toBeInTheDocument();
  });

  it('does not render for a record the failed run does not mention', () => {
    setRuns([FAILED_RUN]);
    render(<RecordRunStatus name="unrelated_chart" />);
    expect(screen.queryByTestId('record-run-status')).not.toBeInTheDocument();
  });

  it('clears when a newer succeeded run mentions the record', () => {
    setRuns([FAILED_RUN]);
    render(<RecordRunStatus name="revenue_insight" />);
    expect(screen.getByTestId('record-run-status')).toBeInTheDocument();

    setRuns([
      {
        id: 'run-10',
        state: 'succeeded',
        dag_filter: '+revenue_insight+',
        error_json: null,
        is_superseded: false,
        created_at: '2026-07-01T13:00:00Z',
      },
      FAILED_RUN,
    ]);
    expect(screen.queryByTestId('record-run-status')).not.toBeInTheDocument();
  });

  it('hides the "View runs" link by default (no /runs route in LocalRouter yet)', () => {
    setRuns([FAILED_RUN]);
    render(<RecordRunStatus name="revenue_insight" />);
    expect(screen.queryByTestId('record-run-status-view-runs')).not.toBeInTheDocument();
    expect(screen.queryByText('View runs')).not.toBeInTheDocument();
  });

  it('renders the "View runs" link to /runs when showRunsLink is set', () => {
    setRuns([FAILED_RUN]);
    render(
      <MemoryRouter future={futureFlags}>
        <RecordRunStatus name="revenue_insight" showRunsLink />
      </MemoryRouter>
    );
    const link = screen.getByTestId('record-run-status-view-runs');
    expect(link).toHaveTextContent('View runs');
    expect(link).toHaveAttribute('href', '/runs');
  });
});
