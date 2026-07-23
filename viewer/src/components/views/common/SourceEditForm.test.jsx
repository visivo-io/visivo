import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SourceEditForm from './SourceEditForm';

// Selector-aware store mock (smoke-test convention): the form destructures
// `useStore()`, so the default export applies selectors against mockState.
const mockActions = {
  deleteSource: jest.fn(),
  testConnection: jest.fn(),
  clearConnectionStatus: jest.fn(),
  checkCommitStatus: jest.fn(),
};
let mockState;
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
  default: selector => (typeof selector === 'function' ? selector(mockState) : mockState),
}));

// The real SourceTypeSelector is a react-select; stub it with plain buttons so
// type switching is a single click. SourceFormGenerator (and getSourceSchema,
// which drives required-field validation) stay REAL.
jest.mock('../../sources/SourceTypeSelector', () => ({
  __esModule: true,
  default: ({ value, onChange, disabled }) => (
    <div>
      <span data-testid="source-type-value">{value}</span>
      <button type="button" disabled={disabled} onClick={() => onChange('sqlite')}>
        pick-sqlite
      </button>
      <button type="button" disabled={disabled} onClick={() => onChange('postgresql')}>
        pick-postgresql
      </button>
    </div>
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mockActions).forEach(fn => fn.mockResolvedValue({ success: true }));
  mockState = { ...mockActions, connectionStatus: {} };
});

const renderForm = (props = {}) =>
  render(
    <SourceEditForm
      source={null}
      isCreate
      onClose={jest.fn()}
      onSave={jest.fn(async () => ({ success: true }))}
      {...props}
    />
  );

const publishedSqlite = {
  name: 's1',
  status: 'PUBLISHED',
  config: { name: 's1', type: 'sqlite', database: 'prod.db' },
};

describe('SourceEditForm — create mode validation', () => {
  test('requires a name and a source type before saving', () => {
    const onSave = jest.fn();
    renderForm({ onSave });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Source type is required')).toBeInTheDocument();
  });

  test('rejects a name that violates the shared name pattern', () => {
    const onSave = jest.fn();
    renderForm({ onSave });
    fireEvent.change(screen.getByLabelText(/Source Name/), { target: { value: 'bad name!' } });
    fireEvent.click(screen.getByText('pick-sqlite'));
    fireEvent.change(screen.getByLabelText(/Database Path/), { target: { value: 'x.db' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Name must start with a letter or number/)).toBeInTheDocument();
  });

  test('validates the schema-required connection fields for the selected type', () => {
    const onSave = jest.fn();
    renderForm({ onSave });
    fireEvent.change(screen.getByLabelText(/Source Name/), { target: { value: 'pg1' } });
    fireEvent.click(screen.getByText('pick-postgresql'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Host is required')).toBeInTheDocument();
    expect(screen.getByText('Database is required')).toBeInTheDocument();
    expect(screen.getByText('Username is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  test('switching source type resets the previously entered connection fields', () => {
    renderForm();
    fireEvent.click(screen.getByText('pick-sqlite'));
    fireEvent.change(screen.getByLabelText(/Database Path/), { target: { value: 'x.db' } });
    fireEvent.click(screen.getByText('pick-postgresql'));
    expect(screen.queryByLabelText(/Database Path/)).not.toBeInTheDocument();
    // postgres' own Database field starts empty — values were reset, not carried over
    // (label renders as "Database*" because the field is required)
    expect(screen.getByLabelText(/^Database\*?$/)).toHaveValue('');
  });
});

describe('SourceEditForm — save paths', () => {
  const fillValidSqlite = () => {
    fireEvent.change(screen.getByLabelText(/Source Name/), { target: { value: 'lite1' } });
    fireEvent.click(screen.getByText('pick-sqlite'));
    fireEvent.change(screen.getByLabelText(/Database Path/), { target: { value: 'db.sqlite' } });
  };

  test('saves a standalone source with name + type + connection fields', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ onSave });
    fillValidSqlite();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('source', 'lite1', {
        name: 'lite1',
        type: 'sqlite',
        database: 'db.sqlite',
      })
    );
    expect(screen.queryByText('Failed to save source')).not.toBeInTheDocument();
  });

  test('surfaces the backend error when the save fails', async () => {
    const onSave = jest.fn(async () => ({ success: false, error: 'disk full' }));
    renderForm({ onSave });
    fillValidSqlite();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('disk full')).toBeInTheDocument();
  });

  test('falls back to a generic message when the save result is empty', async () => {
    const onSave = jest.fn(async () => undefined);
    renderForm({ onSave });
    fillValidSqlite();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed to save source')).toBeInTheDocument();
  });
});

describe('SourceEditForm — edit mode', () => {
  test('initializes from source.config, disables the name, and re-saves the config', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ source: publishedSqlite, isCreate: false, onSave });
    expect(screen.getByLabelText(/Source Name/)).toHaveValue('s1');
    expect(screen.getByLabelText(/Source Name/)).toBeDisabled();
    expect(screen.getByTestId('source-type-value')).toHaveTextContent('sqlite');
    expect(screen.getByLabelText(/Database Path/)).toHaveValue('prod.db');

    fireEvent.change(screen.getByLabelText(/Database Path/), { target: { value: 'new.db' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('source', 's1', {
        name: 's1',
        type: 'sqlite',
        database: 'new.db',
      })
    );
  });

  test('falls back to flat source fields when config is missing (type recovered from the flat object)', () => {
    renderForm({
      source: { name: 'flat1', type: 'duckdb', database: ':memory:', status: 'PUBLISHED' },
      isCreate: false,
    });
    expect(screen.getByLabelText(/Source Name/)).toHaveValue('flat1');
    // The init fallback restores form values AND the type from the flat object,
    // so the form renders duckdb's connection fields — not the "pick a source
    // type" placeholder it used to dead-end on.
    expect(screen.getByTestId('source-type-value')).toHaveTextContent('duckdb');
    expect(screen.getByLabelText(/Database Path/)).toHaveValue(':memory:');
    expect(
      screen.queryByText('Select a source type to configure connection settings')
    ).not.toBeInTheDocument();
  });

  test('clears the connection status for the source on unmount', () => {
    const { unmount } = renderForm({ source: publishedSqlite, isCreate: false });
    unmount();
    expect(mockActions.clearConnectionStatus).toHaveBeenCalledWith('s1');
  });
});

describe('SourceEditForm — delete flow', () => {
  test('deletes after confirmation, refreshes commit status, and closes', async () => {
    const onClose = jest.fn();
    renderForm({ source: publishedSqlite, isCreate: false, onClose });
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/mark it for deletion/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(mockActions.deleteSource).toHaveBeenCalledWith('s1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockActions.checkCommitStatus).toHaveBeenCalled();
  });

  test('shows the delete error and collapses the confirm panel on failure', async () => {
    mockActions.deleteSource.mockResolvedValueOnce({ success: false, error: 'in use' });
    const onClose = jest.fn();
    renderForm({ source: publishedSqlite, isCreate: false, onClose });
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(await screen.findByText('in use')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('warns about discarding unsaved changes for NEW sources and can cancel', () => {
    renderForm({ source: { ...publishedSqlite, status: 'NEW' }, isCreate: false });
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
    // The confirm panel renders above the footer, so its Cancel comes first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockActions.deleteSource).not.toHaveBeenCalled();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });
});

describe('SourceEditForm — test connection', () => {
  test('is disabled until a source type is selected', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeDisabled();
    fireEvent.click(screen.getByText('pick-sqlite'));
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeEnabled();
  });

  test('does not test an invalid form', () => {
    renderForm();
    fireEvent.click(screen.getByText('pick-sqlite'));
    fireEvent.change(screen.getByLabelText(/Database Path/), { target: { value: 'x.db' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    expect(mockActions.testConnection).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  test('sends the assembled config to testConnection when valid', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Source Name/), { target: { value: 't1' } });
    fireEvent.click(screen.getByText('pick-sqlite'));
    fireEvent.change(screen.getByLabelText(/Database Path/), { target: { value: 'x.db' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
    await waitFor(() =>
      expect(mockActions.testConnection).toHaveBeenCalledWith({
        name: 't1',
        type: 'sqlite',
        database: 'x.db',
      })
    );
  });

  test.each([
    [{ status: 'connected' }, 'Connection successful'],
    [{ status: 'failed', error: 'bad creds' }, 'Connection failed: bad creds'],
    [{ status: 'testing' }, 'Testing connection...'],
  ])('renders the %o connection status', (status, text) => {
    mockState.connectionStatus = { s1: status };
    renderForm({ source: publishedSqlite, isCreate: false });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  test('disables Test Connection while a test is in flight', () => {
    mockState.connectionStatus = { s1: { status: 'testing' } };
    renderForm({ source: publishedSqlite, isCreate: false });
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeDisabled();
  });
});

describe('SourceEditForm — embedded sources', () => {
  const embedded = {
    _embedded: { parentName: 'model_a', path: 'source' },
    status: 'NEW',
    config: { type: 'sqlite', database: 'e.db' },
  };

  test('hides the name field, skips name validation, and saves a nameless config', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ source: embedded, isCreate: false, onSave });
    expect(screen.queryByLabelText(/Source Name/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('source', '', { type: 'sqlite', database: 'e.db' })
    );
    expect(onSave.mock.calls[0][2]).not.toHaveProperty('name');
  });

  test('shows back navigation to the parent model and hides delete', () => {
    const onGoBack = jest.fn();
    renderForm({ source: embedded, isCreate: false, onGoBack });
    const backButton = screen.getByRole('button', { name: /Model model_a/ });
    fireEvent.click(backButton);
    expect(onGoBack).toHaveBeenCalled();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });
});

describe('SourceEditForm — seeds', () => {
  const seededSqlite = {
    name: 's1',
    status: 'PUBLISHED',
    config: {
      name: 's1',
      type: 'sqlite',
      database: 'prod.db',
      seeds: [{ table_name: 'raw', args: ['cat', 'raw.csv'] }],
    },
  };

  test('offers the seeds editor once a database type is chosen', () => {
    renderForm();
    expect(screen.queryByText('Add Seed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('pick-sqlite'));
    expect(screen.getByText('Add Seed')).toBeInTheDocument();
  });

  test('round-trips existing seeds through an edit', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ source: seededSqlite, isCreate: false, onSave });

    expect(screen.getByLabelText('Seed 1 table name')).toHaveValue('raw');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2].seeds).toEqual([
      { table_name: 'raw', args: ['cat', 'raw.csv'] },
    ]);
  });

  test('omits seeds entirely when none are configured', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ onSave });
    fireEvent.change(screen.getByLabelText(/Source Name/), { target: { value: 's1' } });
    fireEvent.click(screen.getByText('pick-sqlite'));
    fireEvent.change(screen.getByLabelText(/Database/), { target: { value: 'x.db' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2]).not.toHaveProperty('seeds');
  });

  test('drops the blank arg rows the editor leaves behind', async () => {
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({
      source: {
        ...seededSqlite,
        config: {
          ...seededSqlite.config,
          seeds: [{ table_name: 'raw', args: ['cat', '', 'raw.csv', '  '] }],
        },
      },
      isCreate: false,
      onSave,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][2].seeds[0].args).toEqual(['cat', 'raw.csv']);
  });

  test('refuses to save a seed with no table name', () => {
    const onSave = jest.fn();
    renderForm({
      source: {
        ...seededSqlite,
        config: { ...seededSqlite.config, seeds: [{ table_name: '', args: ['cat'] }] },
      },
      isCreate: false,
      onSave,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText('Every seed needs a table name and at least one command argument')
    ).toBeInTheDocument();
  });

  test('refuses to save a seed with no command', () => {
    const onSave = jest.fn();
    renderForm({
      source: {
        ...seededSqlite,
        config: { ...seededSqlite.config, seeds: [{ table_name: 'raw', args: ['  '] }] },
      },
      isCreate: false,
      onSave,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });
});
