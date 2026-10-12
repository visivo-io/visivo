import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RunsView from './RunsView';
import useRunPolling from '../hooks/useRunPolling';
import useStore from '../stores/store';
import * as runsApi from '../api/runs';

jest.unmock('@tanstack/react-query');

jest.mock('../api/runs', () => ({
  fetchRuns: jest.fn(),
  triggerRun: jest.fn(),
  fetchRunLog: jest.fn(),
  cancelRun: jest.fn(),
}));
jest.mock('./views/workspace/useProjectChangeListener', () => jest.fn());
jest.mock('socket.io-client', () => ({ io: jest.fn() }));

function RunPage() {
  useRunPolling();
  return <RunsView />;
}

const initialState = useStore.getState();
let queryClient;
let serverRuns;
let checkCommitStatus;

beforeEach(() => {
  jest.useFakeTimers();
  serverRuns = [];
  runsApi.fetchRuns.mockImplementation(async () => serverRuns);
  runsApi.triggerRun.mockImplementation(async () => {
    const run = { id: 'new-run', state: 'running', dag_filter: '', created_at: '2026-10-12' };
    serverRuns = [run];
    return { status: 201, body: run };
  });
  checkCommitStatus = jest.fn(async () => useStore.setState({ stagedChanges: [] }));
  useStore.setState({
    ...initialState,
    project: { id: 'p1', status: 'draft' },
    runTrigger: 'manual',
    stagedChanges: [{ type: 'metric', name: 'new_metric', status: 'modified' }],
    checkCommitStatus,
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  queryClient.clear();
  useStore.setState(initialState);
  jest.clearAllTimers();
  jest.useRealTimers();
});

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  jest.advanceTimersByTime(0);
});

test.each([
  ['succeeded', 'No changes waiting to run', 1],
  ['failed', '1 change waiting to run', 0],
  ['canceled', '1 change waiting to run', 0],
])(
  'Run all appears immediately and updates to %s without remounting',
  async (state, stagedHeading, commitChecks) => {
    render(<QueryClientProvider client={queryClient}><RunPage /></QueryClientProvider>);
    await flush();
    expect(screen.getByText('No runs yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run all' }));
    await flush();
    await flush();
    expect(runsApi.triggerRun).toHaveBeenCalledWith('p1', { dagFilter: '' });
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.queryByText('No runs yet.')).not.toBeInTheDocument();

    serverRuns = [{ ...serverRuns[0], state }];
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();
    expect(screen.getByText(state)).toBeInTheDocument();
    expect(screen.queryByText('running')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run all' })).toBeEnabled();
    expect(checkCommitStatus).toHaveBeenCalledTimes(commitChecks);
    expect(screen.getByText(stagedHeading)).toBeInTheDocument();
  }
);
