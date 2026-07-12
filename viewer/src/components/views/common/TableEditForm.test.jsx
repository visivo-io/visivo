/**
 * TableEditForm tests.
 *
 * Pins two regressions:
 *  - the fetch-if-empty mount effect must not re-fire forever when the project
 *    legitimately has zero insights/models (the store writes a FRESH array on
 *    every fetch, so emptiness alone re-triggers the effect);
 *  - a config that (invalidly) sets BOTH a data ref and pivot fields must keep
 *    both sections visible so the validation error can be seen and resolved.
 *
 * Plus interaction-depth coverage of the remaining branches: create-vs-edit
 * init, validation failures, save payload shapes (data ref / pivot / embedded),
 * save failure, delete confirm flow, embedded-data navigation, and the
 * RefListField add/edit/remove editors.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import selectEvent from 'react-select-event';
import TableEditForm from './TableEditForm';
import useStore, { ObjectStatus } from '../../../stores/store';

// The pivot RefListField editors are exercised by their own tests — keep this
// file focused on the form logic (matches editForms.smoke.test.jsx).
jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea aria-label="ref" value={value || ''} onChange={e => onChange?.(e.target.value)} />
  ),
}));

// Edit-mode auto-save routes through the unified useRecordSave backbone; a
// controllable stub lets tests assert the scheduled config + drive status/errors.
const mockScheduleSave = jest.fn();
let mockRecordSave;
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => mockRecordSave,
}));

beforeEach(() => {
  mockScheduleSave.mockClear();
  mockRecordSave = {
    scheduleSave: mockScheduleSave,
    status: 'idle',
    errors: null,
    saveNow: jest.fn(),
    reset: jest.fn(),
  };
});

// Edit mode flips a hydration guard on via setTimeout(0); flush a real macrotask
// so subsequent field edits count as real edits (not hydration). Real timers so
// react-select-event still works for the Select-driven fields.
const renderEditHydrated = async props => {
  const utils = renderForm({ isCreate: false, ...props });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  mockScheduleSave.mockClear();
  return utils;
};

const seed = (overrides = {}) => {
  act(() => {
    useStore.setState({
      deleteTable: jest.fn(async () => ({ success: true })),
      checkCommitStatus: jest.fn(async () => {}),
      insights: [],
      models: [],
      fetchInsights: jest.fn(),
      fetchModels: jest.fn(),
      ...overrides,
    });
  });
};

const renderForm = (props = {}) =>
  render(
    <TableEditForm
      table={null}
      isCreate
      onClose={jest.fn()}
      onSave={jest.fn()}
      onNavigateToEmbedded={jest.fn()}
      {...props}
    />
  );

describe('TableEditForm — fetch guard', () => {
  test('fetches insights/models only once when the project has zero of them', () => {
    const fetchInsights = jest.fn();
    const fetchModels = jest.fn();
    seed({ insights: [], models: [], fetchInsights, fetchModels });

    renderForm();
    expect(fetchInsights).toHaveBeenCalledTimes(1);
    expect(fetchModels).toHaveBeenCalledTimes(1);

    // An empty fetch result writes a FRESH [] to the store — the effect
    // re-runs on the new identity but must NOT refetch (request loop).
    act(() => useStore.setState({ insights: [] }));
    act(() => useStore.setState({ models: [] }));
    expect(fetchInsights).toHaveBeenCalledTimes(1);
    expect(fetchModels).toHaveBeenCalledTimes(1);
  });
});

describe('TableEditForm — data ref + pivot conflict', () => {
  const conflictedTable = {
    name: 'conflicted',
    status: 'PUBLISHED',
    config: {
      name: 'conflicted',
      // eslint-disable-next-line no-template-curly-in-string
      data: '${ref(rev_insight)}',
      // eslint-disable-next-line no-template-curly-in-string
      columns: ['${ref(m).a}'],
    },
  };

  test('keeps BOTH sections visible so the conflict can be resolved', () => {
    seed({
      insights: [{ name: 'rev_insight' }],
      models: [{ name: 'm' }],
      fetchInsights: jest.fn(),
      fetchModels: jest.fn(),
    });
    renderForm({ table: conflictedTable, isCreate: false, onSave: jest.fn() });

    // Both sections must stay visible so the user can remove one of the two; the
    // schema gate (useRecordSave) is what refuses to persist the conflict.
    expect(screen.getByText('Data Source')).toBeInTheDocument();
    expect(screen.getByText('Pivot Configuration')).toBeInTheDocument();
  });
});

// The three pivot RefListFields render in order Columns, Rows, Values, each
// with its own "Add" button; entries share the mocked RefTextArea ('ref').
const ADD_INDEX = { columns: 0, rows: 1, values: 2 };
const addPivotEntry = section =>
  fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[ADD_INDEX[section]]);
const setRefEntry = (index, value) =>
  fireEvent.change(screen.getAllByLabelText('ref')[index], { target: { value } });
const setName = value =>
  fireEvent.change(screen.getByLabelText(/Table Name/), { target: { value } });

describe('TableEditForm — validation', () => {
  test('empty form blocks save with name + data-source errors', async () => {
    seed();
    const onSave = jest.fn();
    renderForm({ onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(
      screen.getByText('A data source or pivot configuration (columns/rows/values) is required')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('rejects names that violate the naming pattern', async () => {
    seed();
    const onSave = jest.fn();
    renderForm({ onSave });

    setName('bad name!');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'Name must start with a letter or number and contain only letters, numbers, underscores, and hyphens'
      )
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('rows + values without columns blocks save', async () => {
    seed();
    const onSave = jest.fn();
    renderForm({ onSave });

    setName('tbl');
    addPivotEntry('rows');
    addPivotEntry('values');
    setRefEntry(0, 'ref(m).region');
    setRefEntry(1, 'sum(ref(m).amount)');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Columns are required when using rows and values')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('a pivot list holding only a blank entry blocks save with a visible error', async () => {
    // Regression: `columns: ['']` used to pass validation and save the blank
    // entry into the config.
    seed();
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ onSave });

    setName('tbl');
    addPivotEntry('columns'); // RefListField's Add scaffolds '' — leave it blank
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Column entries cannot be empty')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('whitespace-only rows/values entries are rejected too', async () => {
    seed();
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ onSave });

    setName('tbl');
    addPivotEntry('columns');
    addPivotEntry('rows');
    addPivotEntry('values'); // stays '' (blank)
    setRefEntry(0, 'ref(m).month');
    setRefEntry(1, '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Row entries cannot be empty')).toBeInTheDocument();
    expect(screen.getByText('Value entries cannot be empty')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('rows without values (or vice versa) blocks save', async () => {
    seed();
    const onSave = jest.fn();
    renderForm({ onSave });

    setName('tbl');
    addPivotEntry('columns');
    addPivotEntry('rows');
    setRefEntry(0, 'ref(m).month');
    setRefEntry(1, 'ref(m).region');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Rows and values must be specified together')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('TableEditForm — save payloads', () => {
  test('saves a data-ref table with the chosen rows-per-page', async () => {
    seed({ insights: [{ name: 'rev_insight' }], models: [{ name: 'm' }] });
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ onSave });

    setName('tbl');
    await selectEvent.select(screen.getByLabelText('Data'), 'rev_insight', {
      container: document.body,
    });
    // Choosing a data source hides the (now-conflicting) pivot section.
    expect(screen.queryByText('Pivot Configuration')).not.toBeInTheDocument();
    await selectEvent.select(screen.getByLabelText('Rows Per Page'), '50', {
      container: document.body,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('table', 'tbl', {
      name: 'tbl',
      rows_per_page: 50,
      data: 'ref(rev_insight)',
    });
  });

  test('saves a pivot table with columns/rows/values and no data key', async () => {
    seed();
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ onSave });

    setName('pivot_tbl');
    addPivotEntry('columns');
    addPivotEntry('rows');
    addPivotEntry('values');
    setRefEntry(0, 'ref(m).month');
    setRefEntry(1, 'ref(m).region');
    setRefEntry(2, 'sum(ref(m).amount)');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, , config] = onSave.mock.calls[0];
    expect(config).toEqual({
      name: 'pivot_tbl',
      rows_per_page: 25,
      columns: ['ref(m).month'],
      rows: ['ref(m).region'],
      values: ['sum(ref(m).amount)'],
    });
    expect(config).not.toHaveProperty('data');
  });

  test('removing a pivot entry drops it from the saved list', async () => {
    seed();
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ onSave });

    setName('cols_only');
    addPivotEntry('columns');
    addPivotEntry('columns');
    setRefEntry(0, 'ref(m).a');
    setRefEntry(1, 'ref(m).b');
    fireEvent.click(screen.getAllByTitle('Remove columns entry')[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, , config] = onSave.mock.calls[0];
    expect(config.columns).toEqual(['ref(m).b']);
  });

  test('a string data ref round-trips through the edit-mode auto-save', async () => {
    seed({ insights: [{ name: 'rev_insight' }], models: [{ name: 'm' }] });
    await renderEditHydrated({
      table: {
        name: 't1',
        status: ObjectStatus.PUBLISHED,
        config: {
          name: 't1',
          // eslint-disable-next-line no-template-curly-in-string
          data: '${ref(rev_insight)}',
          rows_per_page: 100,
        },
      },
    });

    expect(screen.getByLabelText(/Table Name/)).toHaveValue('t1');
    expect(screen.getByLabelText(/Table Name/)).toBeDisabled();
    // A data-ref table hides the pivot section entirely.
    expect(screen.getByText('Data Source')).toBeInTheDocument();
    expect(screen.queryByText('Pivot Configuration')).not.toBeInTheDocument();

    // Edit a field → the data ref is preserved in the scheduled config.
    await selectEvent.select(screen.getByLabelText('Rows Per Page'), '50', {
      container: document.body,
    });

    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 't1',
        rows_per_page: 50,
        data: 'ref(rev_insight)',
      })
    );
  });

  test('surfaces a save failure message', async () => {
    seed();
    const onSave = jest.fn(async () => ({ success: false, error: 'save broke' }));
    renderForm({ onSave });

    setName('tbl');
    addPivotEntry('columns');
    setRefEntry(0, 'ref(m).a');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('save broke')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('falls back to a generic error when onSave resolves without a result', async () => {
    seed();
    const onSave = jest.fn(async () => undefined);
    renderForm({ onSave });

    setName('tbl');
    addPivotEntry('columns');
    setRefEntry(0, 'ref(m).a');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Failed to save table')).toBeInTheDocument();
  });
});

describe('TableEditForm — embedded data source', () => {
  const rawData = { name: 'inline_insight', props: { type: 'scatter' } };
  const embeddedTable = {
    name: 't2',
    status: ObjectStatus.PUBLISHED,
    config: { name: 't2', data: rawData },
  };

  test('renders a navigation button and hands the synthetic object to the parent', () => {
    seed();
    const onNavigateToEmbedded = jest.fn();
    renderForm({ table: embeddedTable, isCreate: false, onNavigateToEmbedded });

    fireEvent.click(screen.getByRole('button', { name: /inline_insight/ }));

    expect(onNavigateToEmbedded).toHaveBeenCalledWith(
      'insight',
      {
        name: 'inline_insight',
        config: rawData,
        _embedded: { parentType: 'table', parentName: 't2', path: 'data' },
      },
      expect.objectContaining({ applyToParent: expect.any(Function) })
    );
    // applyToParent grafts the edited embedded config back onto the table.
    const { applyToParent } = onNavigateToEmbedded.mock.calls[0][2];
    expect(applyToParent({ name: 't2', data: 'old' }, { props: { type: 'bar' } })).toEqual({
      name: 't2',
      data: { props: { type: 'bar' } },
    });
  });

  test('auto-save keeps the embedded object as the data value', async () => {
    seed();
    await renderEditHydrated({ table: embeddedTable });

    await selectEvent.select(screen.getByLabelText('Rows Per Page'), '50', {
      container: document.body,
    });

    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 't2',
        rows_per_page: 50,
        data: rawData,
      })
    );
  });

  test('unnamed embedded data falls back to placeholder labels and survives a missing callback', () => {
    seed();
    const namelessTable = {
      name: 't3',
      status: ObjectStatus.PUBLISHED,
      config: { name: 't3', data: { props: { type: 'bar' } } },
    };
    renderForm({ table: namelessTable, isCreate: false, onNavigateToEmbedded: undefined });

    const button = screen.getByRole('button', { name: /Embedded data source/ });
    // No onNavigateToEmbedded — the click must be a no-op, not a crash.
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /Embedded data source/ })).toBeInTheDocument();
  });
});

describe('TableEditForm — edit-mode auto-save', () => {
  const editTable = {
    name: 't1',
    status: ObjectStatus.PUBLISHED,
    // eslint-disable-next-line no-template-curly-in-string
    config: { name: 't1', data: '${ref(rev_insight)}', rows_per_page: 25 },
  };

  test('shows the SaveStateIndicator instead of a Save/Cancel footer', async () => {
    seed({ insights: [{ name: 'rev_insight' }], models: [{ name: 'm' }] });
    await renderEditHydrated({ table: editTable });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('form-footer-autosave')).toBeInTheDocument();
    expect(screen.getByTitle('Delete table')).toBeInTheDocument();
  });

  test('does not schedule a save on hydration (only on a real edit)', async () => {
    seed({ insights: [{ name: 'rev_insight' }], models: [{ name: 'm' }] });
    // Render + flush hydration WITHOUT the helper's mock-clear, so we can assert
    // nothing was scheduled during hydration.
    renderForm({ isCreate: false, table: editTable });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(mockScheduleSave).not.toHaveBeenCalled();
  });

  test('surfaces schema gate errors reported by the backbone', async () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      status: 'invalid',
      errors: [{ path: 'data', message: 'unknown ref' }],
      saveNow: jest.fn(),
      reset: jest.fn(),
    };
    seed({ insights: [{ name: 'rev_insight' }], models: [{ name: 'm' }] });
    renderForm({ isCreate: false, table: editTable });
    expect(await screen.findByTestId('table-gate-errors')).toHaveTextContent('data: unknown ref');
  });
});

describe('TableEditForm — delete flow', () => {
  const publishedTable = {
    name: 't1',
    status: ObjectStatus.PUBLISHED,
    config: {
      name: 't1',
      // eslint-disable-next-line no-template-curly-in-string
      data: '${ref(rev_insight)}',
    },
  };

  test('confirming deletes the table, refreshes commit status and closes', async () => {
    const deleteTable = jest.fn(async () => ({ success: true }));
    const checkCommitStatus = jest.fn(async () => {});
    seed({ deleteTable, checkCommitStatus });
    const onClose = jest.fn();
    renderForm({ table: publishedTable, isCreate: false, onClose });

    fireEvent.click(screen.getByTitle('Delete table'));
    // Published objects get the mark-for-deletion copy.
    expect(screen.getByText(/mark it for deletion/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() => expect(deleteTable).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(checkCommitStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test('a failed delete surfaces the error and dismisses the confirm', async () => {
    const deleteTable = jest.fn(async () => ({ success: false, error: 'nope' }));
    seed({ deleteTable });
    const onClose = jest.fn();
    renderForm({ table: publishedTable, isCreate: false, onClose });

    fireEvent.click(screen.getByTitle('Delete table'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(await screen.findByText('nope')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('a NEW table warns about discarding unsaved changes; cancel aborts', () => {
    const deleteTable = jest.fn();
    seed({ deleteTable });
    renderForm({ table: { ...publishedTable, status: ObjectStatus.NEW }, isCreate: false });

    fireEvent.click(screen.getByTitle('Delete table'));
    expect(screen.getByText(/discard your unsaved changes/)).toBeInTheDocument();
    // The confirm block renders above the footer actions, so the first
    // Cancel button is the confirmation's Cancel (the footer's is second).
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(deleteTable).not.toHaveBeenCalled();
  });
});
