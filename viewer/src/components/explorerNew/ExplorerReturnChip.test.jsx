import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import ExplorerReturnChip from './ExplorerReturnChip';
import { futureFlags } from '../../router-config';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const renderChip = entry =>
  render(
    <MemoryRouter initialEntries={[entry]} future={futureFlags}>
      <ExplorerReturnChip />
    </MemoryRouter>
  );

describe('ExplorerReturnChip (J-3 / VIS-782)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders nothing on a normal Explorer entry (no params)', () => {
    renderChip('/explorer');
    expect(screen.queryByTestId('explorer-return-chip')).not.toBeInTheDocument();
  });

  it('renders nothing when return_to is set but dashboard is missing', () => {
    renderChip('/explorer?return_to=workspace');
    expect(screen.queryByTestId('explorer-return-chip')).not.toBeInTheDocument();
  });

  it('shows the chip with the dashboard name when entered from Workspace', () => {
    renderChip('/explorer?return_to=workspace&dashboard=simple-dashboard');
    const chip = screen.getByTestId('explorer-return-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('Back to dashboard');
    expect(chip).toHaveTextContent('simple-dashboard');
  });

  it('navigates back to the dashboard in Workspace on click', () => {
    renderChip('/explorer?return_to=workspace&dashboard=simple-dashboard');
    fireEvent.click(screen.getByTestId('explorer-return-chip'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/dashboard/simple-dashboard');
  });

  it('encodes a dashboard name with special characters', () => {
    renderChip('/explorer?return_to=workspace&dashboard=' + encodeURIComponent('my dash'));
    fireEvent.click(screen.getByTestId('explorer-return-chip'));
    expect(mockNavigate).toHaveBeenCalledWith('/workspace/dashboard/my%20dash');
  });
});
