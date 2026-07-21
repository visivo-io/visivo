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

// D7 (e2e-gap-review.md): RunsView now mounts the same H-2 project-change
// socket listener the Workspace uses (useProjectChangeListener) — stub the
// socket client so jsdom never attempts a real polling connection (mirrors
// Workspace.test.jsx's identical stub).
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({ on: jest.fn(), close: jest.fn() })),
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

// 6c-T2 (shell-ia — "Runs view: dark-on-dark text on a shell-less page").
// The view no longer depends on an ancestor for a readable background —
// every entry point (loading / error / loaded) sets its own explicit light
// surface, and destructive states use the shared `highlight` token.
describe('RunsView is self-contained (6c-T2 dark-on-dark hardening)', () => {
  test('the loading state sets its own light background', () => {
    useQuery.mockImplementation(() => ({ data: undefined, isLoading: true, error: null }));
    render(<RunsView />);
    const loading = screen.getByTestId('runs-view-loading');
    expect(loading.className).toContain('bg-gray-50');
  });

  test('the error state sets its own light background and uses the highlight token, not a hand-rolled red', () => {
    useQuery.mockImplementation(() => ({
      data: undefined,
      isLoading: false,
      error: new Error('nope'),
    }));
    render(<RunsView />);
    const errorState = screen.getByTestId('runs-view-error');
    expect(errorState.className).toContain('bg-gray-50');
    expect(errorState.className).toContain('text-highlight');
    expect(errorState.className).not.toContain('text-red');
  });

  test('the loaded state sets its own light background', () => {
    mockQueries({ runs: [] });
    render(<RunsView />);
    expect(screen.getByTestId('runs-view').className).toContain('bg-gray-50');
  });

  test("a failed run's badge and error label use the highlight token, not a hand-rolled red", () => {
    mockQueries({
      runs: [run({ state: 'failed', error_json: { phase: 'run' } })],
      log: { state: 'failed', logs: 'boom', error_json: { phase: 'run' } },
    });
    render(<RunsView />);
    expect(screen.getByText('failed').className).toContain('highlight');
    expect(screen.getByText('failed').className).not.toContain('red');
    expect(screen.getByText('error').className).toContain('text-highlight');

    fireEvent.click(screen.getByRole('button', { name: /failed/i }));
    expect(screen.getByText(/Error — run/).className).toContain('text-highlight');
  });
});

describe('RunsView — RunDetail meta + console-text fallback chain', () => {
  test('a queued run with no dag_filter shows "not set yet" in its OWN detail meta row (distinct from the list Scope column)', () => {
    mockQueries({ runs: [run({ state: 'queued', dag_filter: '' })] });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /queued/i }));
    expect(screen.getByText('not set yet')).toBeInTheDocument();
  });

  test('a terminal run with no dag_filter shows "all (full rebuild)" in its detail meta', () => {
    mockQueries({ runs: [run({ state: 'succeeded', dag_filter: '' })] });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /succeeded/i }));
    expect(screen.getByText('all (full rebuild)')).toBeInTheDocument();
  });

  test('missing created_at / updated_at render the — placeholder instead of a date', () => {
    mockQueries({ runs: [run({ state: 'succeeded', created_at: null, updated_at: null })] });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /succeeded/i }));
    // Two placeholder rows (Created + Updated) plus the list's own Created cell.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  test('a superseded run shows the extra "Superseded" meta row', () => {
    mockQueries({ runs: [run({ state: 'succeeded', is_superseded: true })] });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /succeeded/i }));
    expect(screen.getByText('Superseded')).toBeInTheDocument();
    expect(screen.getByText('A newer run replaced this one.')).toBeInTheDocument();
  });

  test('a non-superseded run never shows the Superseded row', () => {
    mockQueries({ runs: [run({ state: 'succeeded', is_superseded: false })] });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /succeeded/i }));
    expect(screen.queryByText('Superseded')).not.toBeInTheDocument();
  });

  test('an error with logs_tail but no .error field surfaces logs_tail as the console text', () => {
    mockQueries({
      runs: [run({ state: 'failed', error_json: { logs_tail: 'tail output only' } })],
      log: undefined,
    });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /failed/i }));
    expect(screen.getByText('tail output only')).toBeInTheDocument();
    // No `err.phase` on this fixture → the heading has no " — phase" suffix.
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  test('an active run with no log yet and no error shows the "Waiting for output…" placeholder', () => {
    mockQueries({ runs: [run({ state: 'running' })], log: undefined });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /running/i }));
    expect(screen.getByText('Waiting for output…')).toBeInTheDocument();
  });

  test('a terminal run with no log and no error shows "No output captured."', () => {
    mockQueries({ runs: [run({ state: 'canceled', error_json: null })], log: undefined });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: /canceled/i }));
    expect(screen.getByText('No output captured.')).toBeInTheDocument();
  });

  test('an unmapped/unknown run state falls back to the generic gray badge', () => {
    mockQueries({ runs: [run({ state: 'weird_future_state', dag_filter: '' })] });
    render(<RunsView />);
    const badge = screen.getByText('weird_future_state');
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-800');
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
