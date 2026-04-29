import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SourceCreationModal from './SourceCreationModal';
import useSourceModalStore from '../../stores/sourceModalStore';
import useStore from '../../stores/store';

// Mock react-icons and child form to keep these tests focused on the modal shell
jest.mock('react-icons/hi', () => ({
  HiX: () => <span data-testid="close-icon" />,
}));

jest.mock('../new-views/common/SourceEditForm', () => ({ onClose, onSave }) => (
  <div data-testid="source-edit-form">
    <button
      type="button"
      onClick={() => onSave('source', 'my_src', { name: 'my_src', type: 'sqlite' })}
    >
      MockSave
    </button>
    <button type="button" onClick={onClose}>
      MockCancel
    </button>
  </div>
));

jest.mock('../../stores/store');

describe('SourceCreationModal', () => {
  const mockSaveSource = jest.fn();
  const mockFetchSources = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useSourceModalStore.setState({
      isOpen: false,
      onSaveOverride: null,
      onSaveSuccess: null,
    });

    mockSaveSource.mockResolvedValue({ success: true });
    mockFetchSources.mockResolvedValue();

    useStore.mockImplementation(selector => {
      const state = {
        saveSource: mockSaveSource,
        fetchSources: mockFetchSources,
      };
      return typeof selector === 'function' ? selector(state) : state;
    });
  });

  test('renders nothing when isOpen is false', () => {
    const { container } = render(<SourceCreationModal />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('source-creation-modal')).not.toBeInTheDocument();
  });

  test('renders modal with form when isOpen is true', () => {
    useSourceModalStore.setState({ isOpen: true });
    render(<SourceCreationModal />);

    expect(screen.getByTestId('source-creation-modal')).toBeInTheDocument();
    expect(screen.getByTestId('source-edit-form')).toBeInTheDocument();
    expect(screen.getByText('Add Data Source')).toBeInTheDocument();
  });

  test('close button calls close on store', () => {
    useSourceModalStore.setState({ isOpen: true });
    render(<SourceCreationModal />);

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);

    expect(useSourceModalStore.getState().isOpen).toBe(false);
  });

  test('default onSave invokes store saveSource and fetchSources', async () => {
    useSourceModalStore.setState({ isOpen: true });
    render(<SourceCreationModal />);

    fireEvent.click(screen.getByText('MockSave'));

    await waitFor(() => {
      expect(mockSaveSource).toHaveBeenCalledWith('my_src', {
        name: 'my_src',
        type: 'sqlite',
      });
    });
    expect(mockFetchSources).toHaveBeenCalled();
    // Closes modal on success
    expect(useSourceModalStore.getState().isOpen).toBe(false);
  });

  test('uses onSaveOverride when provided', async () => {
    const customSave = jest.fn().mockResolvedValue({ success: true });
    useSourceModalStore.setState({
      isOpen: true,
      onSaveOverride: customSave,
    });

    render(<SourceCreationModal />);
    fireEvent.click(screen.getByText('MockSave'));

    await waitFor(() => {
      expect(customSave).toHaveBeenCalledWith('source', 'my_src', {
        name: 'my_src',
        type: 'sqlite',
      });
    });
    expect(mockSaveSource).not.toHaveBeenCalled();
    expect(mockFetchSources).not.toHaveBeenCalled();
    expect(useSourceModalStore.getState().isOpen).toBe(false);
  });

  test('invokes onSaveSuccess after a successful save', async () => {
    const onSaveSuccess = jest.fn().mockResolvedValue();
    useSourceModalStore.setState({
      isOpen: true,
      onSaveSuccess,
    });

    render(<SourceCreationModal />);
    fireEvent.click(screen.getByText('MockSave'));

    await waitFor(() => {
      expect(onSaveSuccess).toHaveBeenCalled();
    });
    expect(useSourceModalStore.getState().isOpen).toBe(false);
  });

  test('does not close modal if save fails', async () => {
    mockSaveSource.mockResolvedValue({ success: false, error: 'boom' });
    useSourceModalStore.setState({ isOpen: true });
    render(<SourceCreationModal />);

    fireEvent.click(screen.getByText('MockSave'));

    await waitFor(() => {
      expect(mockSaveSource).toHaveBeenCalled();
    });
    expect(useSourceModalStore.getState().isOpen).toBe(true);
  });
});
