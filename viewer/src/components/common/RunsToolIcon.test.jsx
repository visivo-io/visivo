import { render, screen } from '@testing-library/react';
import RunsToolIcon from './RunsToolIcon';
import useStore from '../../stores/store';

jest.mock('../../stores/store');

const setRunState = state => {
  useStore.mockImplementation(selector => selector({ latestRun: state ? { state } : null }));
};

describe('RunsToolIcon', () => {
  it('spins with a Running title while a run is running', () => {
    setRunState('running');
    render(<RunsToolIcon />);
    expect(screen.getByTitle('Running…')).toBeInTheDocument();
  });

  it('spins with a Queued title while a run is queued (the moment you edit)', () => {
    setRunState('queued');
    render(<RunsToolIcon />);
    expect(screen.getByTitle('Queued…')).toBeInTheDocument();
  });

  it('does not spin when there is no run', () => {
    setRunState(null);
    render(<RunsToolIcon />);
    expect(screen.queryByTitle('Running…')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Queued…')).not.toBeInTheDocument();
  });

  it('does not spin when the latest run succeeded', () => {
    setRunState('succeeded');
    render(<RunsToolIcon />);
    expect(screen.queryByTitle('Running…')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Queued…')).not.toBeInTheDocument();
  });

  it('does not spin when the latest run failed', () => {
    setRunState('failed');
    render(<RunsToolIcon />);
    expect(screen.queryByTitle('Running…')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Queued…')).not.toBeInTheDocument();
  });
});

// The dot is the only thing telling a manual-trigger user they have work
// outstanding — their edits don't start a run, so nothing else moves.
describe('RunsToolIcon staged dot', () => {
  const setState = state => {
    useStore.mockImplementation(selector => selector(state));
  };

  it('appears when there are changes nobody has run', () => {
    setState({ latestRun: { state: 'succeeded' }, stagedCount: 2 });
    render(<RunsToolIcon />);
    expect(screen.getByTestId('runs-tool-staged-dot')).toBeInTheDocument();
  });

  it('stays away when everything is built', () => {
    setState({ latestRun: { state: 'succeeded' }, stagedCount: 0 });
    render(<RunsToolIcon />);
    expect(screen.queryByTestId('runs-tool-staged-dot')).not.toBeInTheDocument();
  });

  it('yields to the spinner while a run is in flight', () => {
    // The run IS the answer to "there is outstanding work" at that point;
    // showing both would say the same thing twice.
    setState({ latestRun: { state: 'running' }, stagedCount: 2 });
    render(<RunsToolIcon />);
    expect(screen.queryByTestId('runs-tool-staged-dot')).not.toBeInTheDocument();
  });
});
