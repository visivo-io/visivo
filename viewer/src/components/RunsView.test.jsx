import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import RunsView from './RunsView';
import { cancelRun } from '../api/runs';
import useStore from '../stores/store';

// Control the runs the view renders; the real store provides the project id.
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(),
    // The cancel button's mutation: run mutationFn immediately so a click is
    // observable without a real QueryClient.
    useMutation: jest.fn(({ mutationFn }) => ({
      mutate: (...args) => mutationFn(...args),
      isPending: false,
      isError: false,
    })),
    useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  };
});
jest.mock('../api/runs', () => ({
  fetchRuns: jest.fn(),
  fetchRunLog: jest.fn(),
  cancelRun: jest.fn(),
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

const logQueryOpts = () => useQuery.mock.calls.find(([opts]) => opts.queryKey[0] === 'runLog')?.[0];

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

// Cancelling a run: the button only exists while there's something to cancel,
// and its whole job is reopening the commit gate — the state change, not
// killing compute (which the server does best-effort).
describe('RunsView cancel', () => {
  const openDetail = () => fireEvent.click(screen.getByRole('button', { expanded: false }));

  test('an active run offers a cancel button', () => {
    mockQueries({ runs: [run({ state: 'running' })], log: { logs: '' } });
    render(<RunsView />);
    openDetail();
    expect(screen.getByRole('button', { name: /cancel run/i })).toBeInTheDocument();
  });

  test('a queued run offers it too — that is the one users get stuck on', () => {
    mockQueries({ runs: [run({ state: 'queued' })], log: { logs: '' } });
    render(<RunsView />);
    openDetail();
    expect(screen.getByRole('button', { name: /cancel run/i })).toBeInTheDocument();
  });

  test.each(['succeeded', 'failed', 'canceled'])('a %s run offers no cancel button', state => {
    mockQueries({ runs: [run({ state })], log: { logs: '' } });
    render(<RunsView />);
    openDetail();
    expect(screen.queryByRole('button', { name: /cancel run/i })).not.toBeInTheDocument();
  });

  test('clicking it cancels that specific run', () => {
    cancelRun.mockResolvedValue({ status: 200, body: { state: 'canceled' } });
    mockQueries({ runs: [run({ id: 'r-target', state: 'running' })], log: { logs: '' } });
    render(<RunsView />);
    openDetail();
    fireEvent.click(screen.getByRole('button', { name: /cancel run/i }));
    expect(cancelRun).toHaveBeenCalledWith('r-target');
  });
});

describe('RunsView staged panel', () => {
  const staged = [
    { name: 'db', type: 'source', status: 'modified' },
    { name: 'orders', type: 'model', status: 'modified' },
  ];

  const setup = (state = {}) => {
    const triggerRun = jest.fn().mockResolvedValue({ success: true });
    const setRunTrigger = jest.fn();
    useStore.setState({
      project: { id: 'p1' },
      stagedChanges: staged,
      runTrigger: 'manual',
      latestRun: null,
      triggerRun,
      setRunTrigger,
      ...state,
    });
    return { triggerRun, setRunTrigger };
  };

  test('lists what a run would build', () => {
    setup();
    mockQueries({ runs: [] });
    render(<RunsView />);
    expect(screen.getByText('db')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('2 changes waiting to run')).toBeInTheDocument();
  });

  test('the button names the count so it matches the list', () => {
    setup();
    mockQueries({ runs: [] });
    render(<RunsView />);
    expect(screen.getByRole('button', { name: 'Run 2' })).toBeInTheDocument();
  });

  test('clicking it builds the staged set — no explicit filter', async () => {
    const { triggerRun } = setup();
    mockQueries({ runs: [] });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Run 2' }));
    // Called with no argument: the server then scopes the run to the same
    // unbuilt set it listed. An explicit '' would mean "rebuild everything".
    await waitFor(() => expect(triggerRun).toHaveBeenCalledWith());
  });

  test('with nothing staged it offers Run all rather than going dead', () => {
    // The escape hatch: the only way back when outputs are missing but the
    // fingerprints claim they are built.
    setup({ stagedChanges: [] });
    mockQueries({ runs: [] });
    render(<RunsView />);
    const button = screen.getByRole('button', { name: 'Run all' });
    expect(button).toBeEnabled();
    expect(screen.getByText('No changes waiting to run')).toBeInTheDocument();
  });

  test('is disabled while a run is in flight', () => {
    setup({ latestRun: { id: 'r1', state: 'running' } });
    mockQueries({ runs: [] });
    render(<RunsView />);
    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled();
  });

  test('surfaces a refusal instead of silently doing nothing', async () => {
    const { triggerRun } = setup();
    triggerRun.mockResolvedValue({ success: false, action: 'run_in_progress' });
    mockQueries({ runs: [] });
    render(<RunsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Run 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already in progress');
  });

  test('the toggle reflects and changes the trigger mode', () => {
    const { setRunTrigger } = setup();
    mockQueries({ runs: [] });
    render(<RunsView />);
    expect(screen.getByRole('button', { name: 'Manual' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Automatic' }));
    expect(setRunTrigger).toHaveBeenCalledWith('automatic');
  });

  test('the scope is stated in the control, not hidden in a tooltip', () => {
    setup();
    mockQueries({ runs: [] });
    render(<RunsView />);
    expect(screen.getByText('Applies to all your projects.')).toBeInTheDocument();
  });
});
