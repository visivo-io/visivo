import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExplorationTabBar from './ExplorationTabBar';
import useStore from '../../stores/store';

const twoExplorations = [
  { id: 'exp-1', name: 'Exploration 1', isDirty: false },
  { id: 'exp-2', name: 'Exploration 2', isDirty: false },
];

const defaultState = {
  explorerExplorations: twoExplorations,
  explorerActiveExplorationId: 'exp-1',
  switchExploration: jest.fn(),
  createNewExploration: jest.fn(),
  closeExploration: jest.fn(),
  renameExploration: jest.fn().mockResolvedValue(undefined),
};

describe('ExplorationTabBar', () => {
  beforeEach(() => {
    useStore.setState(defaultState);
  });

  it('does not render when only one exploration exists', () => {
    useStore.setState({
      explorerExplorations: [{ id: 'exp-1', name: 'Exploration 1', isDirty: false }],
    });
    render(<ExplorationTabBar />);
    expect(screen.queryByTestId('exploration-tab-bar')).not.toBeInTheDocument();
  });

  it('renders tabs for all explorations when 2+ exist', () => {
    render(<ExplorationTabBar />);

    expect(screen.getByTestId('exploration-tab-exp-1')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-tab-exp-2')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    render(<ExplorationTabBar />);

    const activeTab = screen.getByTestId('exploration-tab-exp-1');
    expect(activeTab.className).toContain('border-primary');

    const inactiveTab = screen.getByTestId('exploration-tab-exp-2');
    expect(inactiveTab.className).toContain('border-transparent');
  });

  it('switches exploration on tab click', () => {
    const mockSwitch = jest.fn();
    useStore.setState({ switchExploration: mockSwitch });

    render(<ExplorationTabBar />);

    fireEvent.click(screen.getByTestId('exploration-tab-exp-2'));
    expect(mockSwitch).toHaveBeenCalledWith('exp-2');
  });

  it('shows rename input on double-click', () => {
    render(<ExplorationTabBar />);

    fireEvent.doubleClick(screen.getByTestId('exploration-tab-exp-1'));
    expect(screen.getByTestId('exploration-rename-input')).toBeInTheDocument();
    expect(screen.getByTestId('exploration-rename-input').value).toBe('Exploration 1');
  });

  it('commits rename on Enter key', async () => {
    const mockRename = jest.fn().mockResolvedValue(undefined);
    useStore.setState({ renameExploration: mockRename });

    render(<ExplorationTabBar />);

    fireEvent.doubleClick(screen.getByTestId('exploration-tab-exp-1'));
    const input = screen.getByTestId('exploration-rename-input');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith('exp-1', 'New Name');
    });
  });

  it('cancels rename on Escape key', () => {
    render(<ExplorationTabBar />);

    fireEvent.doubleClick(screen.getByTestId('exploration-tab-exp-1'));
    expect(screen.getByTestId('exploration-rename-input')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('exploration-rename-input'), { key: 'Escape' });
    expect(screen.queryByTestId('exploration-rename-input')).not.toBeInTheDocument();
  });

  it('commits rename on blur', async () => {
    const mockRename = jest.fn().mockResolvedValue(undefined);
    useStore.setState({ renameExploration: mockRename });

    render(<ExplorationTabBar />);

    fireEvent.doubleClick(screen.getByTestId('exploration-tab-exp-1'));
    const input = screen.getByTestId('exploration-rename-input');
    fireEvent.change(input, { target: { value: 'Blurred Name' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith('exp-1', 'Blurred Name');
    });
  });

  it('shows dirty indicator on unsaved tabs', () => {
    useStore.setState({
      explorerExplorations: [
        { id: 'exp-1', name: 'Exploration 1', isDirty: true },
        { id: 'exp-2', name: 'Exploration 2', isDirty: false },
      ],
    });

    render(<ExplorationTabBar />);

    expect(screen.getByTestId('dirty-indicator-exp-1')).toBeInTheDocument();
    expect(screen.queryByTestId('dirty-indicator-exp-2')).not.toBeInTheDocument();
  });

  it('shows close button for each tab', () => {
    render(<ExplorationTabBar />);

    expect(screen.getByTestId('close-tab-exp-1')).toBeInTheDocument();
    expect(screen.getByTestId('close-tab-exp-2')).toBeInTheDocument();
  });

  it('closes tab on close button click', async () => {
    const mockClose = jest.fn().mockResolvedValue(undefined);
    useStore.setState({ closeExploration: mockClose });

    render(<ExplorationTabBar />);

    fireEvent.click(screen.getByTestId('close-tab-exp-2'));

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalledWith('exp-2');
    });
  });

  it('close button does not trigger tab switch', async () => {
    const mockSwitch = jest.fn();
    const mockClose = jest.fn().mockResolvedValue(undefined);
    useStore.setState({ switchExploration: mockSwitch, closeExploration: mockClose });

    render(<ExplorationTabBar />);

    fireEvent.click(screen.getByTestId('close-tab-exp-2'));

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalledWith('exp-2');
    });
    expect(mockSwitch).not.toHaveBeenCalledWith('exp-2');
  });

  it('creates new exploration on + button click', () => {
    const mockCreate = jest.fn();
    useStore.setState({ createNewExploration: mockCreate });

    render(<ExplorationTabBar />);

    fireEvent.click(screen.getByTestId('new-exploration-btn'));
    expect(mockCreate).toHaveBeenCalled();
  });

  it('shows exploration names', () => {
    render(<ExplorationTabBar />);

    expect(screen.getByText('Exploration 1')).toBeInTheDocument();
    expect(screen.getByText('Exploration 2')).toBeInTheDocument();
  });

  it('renders new exploration button', () => {
    render(<ExplorationTabBar />);

    expect(screen.getByTestId('new-exploration-btn')).toBeInTheDocument();
  });
});
