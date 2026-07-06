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
