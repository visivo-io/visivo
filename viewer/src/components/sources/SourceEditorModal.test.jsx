import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import SourceEditorModal from './SourceEditorModal';
import useStore from '../../stores/store';

// Uses the real zustand store: state is seeded per-test via useStore.setState
// and the async source actions are replaced with jest.fn()s so no API calls fire.

const seedStore = (overrides = {}) => {
  const actions = {
    saveSource: jest.fn().mockResolvedValue({ success: true }),
    testConnection: jest.fn().mockResolvedValue(undefined),
    closeSourceModal: jest.fn(),
    clearConnectionStatus: jest.fn(),
  };
  useStore.setState({
    sourceModalOpen: true,
    editingSource: null,
    connectionStatus: {},
    ...actions,
    ...overrides,
  });
  return actions;
};

const typeInto = (labelMatcher, value) => {
  fireEvent.change(screen.getByLabelText(labelMatcher), { target: { value } });
};

const pickSourceType = label => {
  const combo = within(screen.getByTestId('source-type-select')).getByRole('combobox');
  fireEvent.mouseDown(combo);
  fireEvent.click(screen.getAllByRole('option').find(o => o.textContent === label));
};

const fillValidPostgresForm = (name = 'pg1') => {
  typeInto(/Source Name/, name);
  pickSourceType('PostgreSQL');
  typeInto(/^Host/, 'localhost');
  typeInto(/^Database/, 'analytics');
  typeInto(/^Username/, 'admin');
  typeInto(/^Password/, 'hunter2');
};

describe('SourceEditorModal', () => {
  it('renders nothing while the modal is closed', () => {
    seedStore({ sourceModalOpen: false });
    render(<SourceEditorModal />);
    expect(screen.queryByText('Create New Source')).not.toBeInTheDocument();
  });

  describe('create mode', () => {
    it('shows the create heading with an enabled, empty name field', () => {
      seedStore();
      render(<SourceEditorModal />);
      expect(screen.getByText('Create New Source')).toBeInTheDocument();
      const nameInput = screen.getByLabelText(/Source Name/);
      expect(nameInput).toHaveValue('');
      expect(nameInput).not.toBeDisabled();
    });

    it('blocks save and surfaces validation errors when name and type are missing', async () => {
      const { saveSource } = seedStore();
      render(<SourceEditorModal />);
      fireEvent.click(screen.getByText('Save'));
      expect(await screen.findByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Source type is required')).toBeInTheDocument();
      expect(saveSource).not.toHaveBeenCalled();
    });

    it('rejects names that violate the shared name pattern', async () => {
      const { saveSource } = seedStore();
      render(<SourceEditorModal />);
      typeInto(/Source Name/, 'bad name!');
      pickSourceType('SQLite');
      fireEvent.click(screen.getByText('Save'));
      expect(await screen.findByText(/Name must start with a letter or number/)).toBeInTheDocument();
      expect(saveSource).not.toHaveBeenCalled();
    });

    it('requires the schema-required fields for the chosen source type', async () => {
      const { saveSource } = seedStore();
      render(<SourceEditorModal />);
      typeInto(/Source Name/, 'pg1');
      pickSourceType('PostgreSQL');
      fireEvent.click(screen.getByText('Save'));
      expect(await screen.findByText('Host is required')).toBeInTheDocument();
      expect(screen.getByText('Database is required')).toBeInTheDocument();
      expect(screen.getByText('Username is required')).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
      expect(saveSource).not.toHaveBeenCalled();
    });

    it('saves a valid source and closes the modal on success', async () => {
      const { saveSource, closeSourceModal } = seedStore();
      render(<SourceEditorModal />);
      fillValidPostgresForm();
      fireEvent.click(screen.getByText('Save'));
      await waitFor(() => expect(closeSourceModal).toHaveBeenCalled());
      expect(saveSource).toHaveBeenCalledWith(
        'pg1',
        expect.objectContaining({
          name: 'pg1',
          type: 'postgresql',
          host: 'localhost',
          database: 'analytics',
          username: 'admin',
          password: 'hunter2',
        })
      );
    });

    it('shows a saving spinner while the save is in flight', async () => {
      let resolveSave;
      const { closeSourceModal } = seedStore({
        saveSource: jest.fn(
          () => new Promise(resolve => (resolveSave = resolve))
        ),
      });
      render(<SourceEditorModal />);
      fillValidPostgresForm();
      fireEvent.click(screen.getByText('Save'));
      expect(await screen.findByText('Saving...')).toBeInTheDocument();
      await act(async () => resolveSave({ success: true }));
      await waitFor(() => expect(closeSourceModal).toHaveBeenCalled());
    });

    it('keeps the modal open and shows the error when save fails', async () => {
      const { closeSourceModal } = seedStore({
        saveSource: jest.fn().mockResolvedValue({ success: false, error: 'connection refused' }),
      });
      render(<SourceEditorModal />);
      fillValidPostgresForm();
      fireEvent.click(screen.getByText('Save'));
      expect(await screen.findByText('connection refused')).toBeInTheDocument();
      expect(closeSourceModal).not.toHaveBeenCalled();
    });

    it('falls back to a generic save error message when none is returned', async () => {
      seedStore({ saveSource: jest.fn().mockResolvedValue({ success: false }) });
      render(<SourceEditorModal />);
      fillValidPostgresForm();
      fireEvent.click(screen.getByText('Save'));
      expect(await screen.findByText('Failed to save source')).toBeInTheDocument();
    });

    it('resets the type-specific field values when the source type changes', () => {
      seedStore();
      render(<SourceEditorModal />);
      pickSourceType('PostgreSQL');
      typeInto(/^Host/, 'pg-host');
      pickSourceType('MySQL');
      // MySQL shares a Host field; the value typed under postgresql must be gone.
      expect(screen.getByLabelText(/^Host/)).toHaveValue('');
    });
  });

  describe('test connection', () => {
    it('is disabled until a source type is chosen', () => {
      seedStore();
      render(<SourceEditorModal />);
      expect(screen.getByRole('button', { name: 'Test Connection' })).toBeDisabled();
    });

    it('does not test when the form is invalid', () => {
      const { testConnection } = seedStore();
      render(<SourceEditorModal />);
      typeInto(/Source Name/, 'pg1');
      pickSourceType('PostgreSQL'); // required fields still empty
      fireEvent.click(screen.getByText('Test Connection'));
      expect(testConnection).not.toHaveBeenCalled();
    });

    it('sends the assembled config when the form is valid', async () => {
      const { testConnection } = seedStore();
      render(<SourceEditorModal />);
      fillValidPostgresForm();
      fireEvent.click(screen.getByText('Test Connection'));
      await waitFor(() =>
        expect(testConnection).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'pg1', type: 'postgresql', host: 'localhost' })
        )
      );
    });

    it.each([
      ['testing', 'Testing connection...'],
      ['connected', 'Connection successful'],
    ])('renders the %s connection status', (status, message) => {
      seedStore({ connectionStatus: { new: { status } } });
      render(<SourceEditorModal />);
      expect(screen.getByText(message)).toBeInTheDocument();
    });

    it('renders the failure status with the backend error', () => {
      seedStore({ connectionStatus: { new: { status: 'failed', error: 'bad password' } } });
      render(<SourceEditorModal />);
      expect(screen.getByText(/Connection failed: bad password/)).toBeInTheDocument();
    });

    it('disables the test button while a test is in flight', () => {
      seedStore({ connectionStatus: { new: { status: 'testing' } } });
      render(<SourceEditorModal />);
      expect(screen.getByRole('button', { name: 'Test Connection' })).toBeDisabled();
    });
  });

  describe('edit mode', () => {
    const editingSource = {
      name: 'warehouse',
      type: 'postgresql',
      status: 'published',
      host: 'db.internal',
      database: 'prod',
      username: 'svc',
      password: 'secret',
    };

    it('prefills the form from the source and locks name + type', () => {
      seedStore({ editingSource });
      render(<SourceEditorModal />);
      expect(screen.getByText('Edit Source: warehouse')).toBeInTheDocument();
      expect(screen.getByLabelText(/Source Name/)).toHaveValue('warehouse');
      expect(screen.getByLabelText(/Source Name/)).toBeDisabled();
      expect(screen.getByLabelText(/^Host/)).toHaveValue('db.internal');
    });

    it('saves the edited source under its existing name', async () => {
      const { saveSource, closeSourceModal } = seedStore({ editingSource });
      render(<SourceEditorModal />);
      typeInto(/^Host/, 'db.failover');
      fireEvent.click(screen.getByText('Save'));
      await waitFor(() => expect(closeSourceModal).toHaveBeenCalled());
      expect(saveSource).toHaveBeenCalledWith(
        'warehouse',
        expect.objectContaining({ name: 'warehouse', host: 'db.failover' })
      );
      // `status` is bookkeeping, not connection config — it must not be saved.
      expect(saveSource.mock.calls[0][1]).not.toHaveProperty('status');
    });

    it('prefers the nested config payload when the source carries one', () => {
      seedStore({
        editingSource: {
          name: 'warehouse',
          type: 'postgresql',
          config: { name: 'warehouse', type: 'postgresql', host: 'from-config' },
        },
      });
      render(<SourceEditorModal />);
      expect(screen.getByLabelText(/^Host/)).toHaveValue('from-config');
    });

    it('clears the connection status for the source when the modal closes', () => {
      const { clearConnectionStatus } = seedStore({ editingSource });
      render(<SourceEditorModal />);
      act(() => {
        useStore.setState({ sourceModalOpen: false });
      });
      expect(clearConnectionStatus).toHaveBeenCalledWith('warehouse');
    });
  });

  describe('closing', () => {
    it('closes via the Cancel button', () => {
      const { closeSourceModal } = seedStore();
      render(<SourceEditorModal />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(closeSourceModal).toHaveBeenCalledTimes(1);
    });

    it('closes when clicking the overlay backdrop, but not the modal body', () => {
      const { closeSourceModal } = seedStore();
      const { container } = render(<SourceEditorModal />);
      // Clicks inside the modal body must not close (stopPropagation).
      fireEvent.click(screen.getByText('Create New Source'));
      expect(closeSourceModal).not.toHaveBeenCalled();
      // eslint-disable-next-line testing-library/no-node-access
      fireEvent.click(container.firstChild); // the overlay itself
      expect(closeSourceModal).toHaveBeenCalledTimes(1);
    });
  });
});
