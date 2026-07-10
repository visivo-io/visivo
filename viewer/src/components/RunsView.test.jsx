import { render, screen, fireEvent } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import RunsView from './RunsView';
import useStore from '../stores/store';

// Control the runs the view renders; the real store provides the project id.
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return { ...actual, useQuery: jest.fn() };
});
jest.mock('../api/branching', () => ({
  fetchRuns: jest.fn(),
  fetchRunLog: jest.fn(),
}));

// RunsView and the expanded RunDetail each call useQuery; dispatch on the key so
// the runs list and a run's log can be controlled independently.
const mockQueries = ({ runs, log }) =>
  useQuery.mockImplementation(({ queryKey }) =>
    queryKey[0] === 'runLog'
      ? { data: log, isLoading: false, error: null }
      : { data: runs, isLoading: false, error: null }
  );

const run = over => ({
  id: 'r1',
  state: 'running',
  dag_filter: '',
  created_at: '2026-06-24T00:00:00Z',
  ...over,
});

const logQueryOpts = () =>
  useQuery.mock.calls.find(([opts]) => opts.queryKey[0] === 'runLog')?.[0];

beforeEach(() => {
  useQuery.mockReset();
  useStore.setState({ project: { id: 'p1' } });
});

describe('RunsView scope column', () => {
  test('a queued run not yet picked up shows — (not "all")', () => {
    mockQueries({ runs: [run({ state: 'queued', dag_filter: '' })] });
    render(<RunsView />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('all')).not.toBeInTheDocument();
  });

  test('a started run with no filter shows "all" (a real full rebuild)', () => {
    mockQueries({ runs: [run({ state: 'running', dag_filter: '' })] });
    render(<RunsView />);
    expect(screen.getByText('all')).toBeInTheDocument();
  });

  test('a scoped run shows its dag_filter', () => {
    mockQueries({ runs: [run({ state: 'running', dag_filter: '+db+' })] });
    render(<RunsView />);
    expect(screen.getByText('+db+')).toBeInTheDocument();
  });
});

describe('RunsView detail expansion', () => {
  test('expanding a run shows its captured log, labeled Logs', () => {
    mockQueries({
      runs: [run({ state: 'succeeded' })],
      log: { state: 'succeeded', logs: 'visivo run complete\n3 insights built', error_json: null },
    });
    render(<RunsView />);
    expect(screen.queryByText(/3 insights built/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /succeeded/i }));
    expect(screen.getByText(/3 insights built/)).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    // A finished run fetches once — no tail-polling.
    expect(logQueryOpts().refetchInterval).toBe(false);
  });

  test('an active run tail-polls its log so output streams in', () => {
    mockQueries({
      runs: [run({ state: 'running' })],
      log: { state: 'running', logs: 'building orders…', error_json: null },
    });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /running/i }));
    expect(screen.getByText(/building orders…/)).toBeInTheDocument();
    expect(logQueryOpts().refetchInterval).toBe(2000);
  });

  test("a failed run's log is hidden until clicked, then shows the error heading + log", () => {
    mockQueries({
      runs: [run({ state: 'failed', error_json: { phase: 'run' } })],
      log: { state: 'failed', logs: 'boom: query failed at line 3', error_json: { phase: 'run' } },
    });
    render(<RunsView />);
    expect(screen.queryByText(/boom: query failed/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /failed/i }));
    expect(screen.getByText(/boom: query failed at line 3/)).toBeInTheDocument();
    expect(screen.getByText(/Error — run/)).toBeInTheDocument();
  });
});
