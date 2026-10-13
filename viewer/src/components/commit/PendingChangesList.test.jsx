/**
 * The change list local and cloud share (VIS-1396).
 *
 * This component is vendored into core, so it is the contract between the two
 * commit panels. Both backends answer `/changes/` with the same
 * `{name, type, status}` entries, which is what makes one component honest
 * rather than a coincidence — these tests use that shape directly.
 */
import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import PendingChangesList from './PendingChangesList';

const CHANGES = [
  { name: 'orders', type: 'model', status: 'modified' },
  { name: 'revenue', type: 'chart', status: 'new' },
  { name: 'old_table', type: 'table', status: 'deleted' },
];

test('lists every change by name', () => {
  render(<PendingChangesList changes={CHANGES} />);

  expect(screen.getByText('orders')).toBeInTheDocument();
  expect(screen.getByText('revenue')).toBeInTheDocument();
  expect(screen.getByText('old_table')).toBeInTheDocument();
});

test('labels each status, so a deletion is not mistaken for an edit', () => {
  render(<PendingChangesList changes={CHANGES} />);

  expect(screen.getByText('MODIFIED')).toBeInTheDocument();
  expect(screen.getByText('NEW')).toBeInTheDocument();
  expect(screen.getByText('DELETED')).toBeInTheDocument();
});

test('an unknown status still renders, rather than blanking the row', () => {
  // The two backends could gain a status independently; showing the raw value
  // is worse than nothing only if nothing is the alternative.
  render(<PendingChangesList changes={[{ name: 'x', type: 'model', status: 'archived' }]} />);

  expect(screen.getByText('archived')).toBeInTheDocument();
  expect(screen.getByText('x')).toBeInTheDocument();
});

describe('undo', () => {
  test('is offered only on deletions', () => {
    render(<PendingChangesList changes={CHANGES} onRestore={jest.fn()} />);

    expect(screen.getByTestId('commit-modal-restore-table-old_table')).toBeInTheDocument();
    expect(screen.queryByTestId('commit-modal-restore-model-orders')).not.toBeInTheDocument();
  });

  test('is absent entirely without a handler, which is how cloud renders it', () => {
    render(<PendingChangesList changes={CHANGES} />);

    expect(screen.queryByTestId('commit-modal-restore-table-old_table')).not.toBeInTheDocument();
  });

  test('calls back with the type and name', async () => {
    const onRestore = jest.fn().mockResolvedValue(undefined);
    render(<PendingChangesList changes={CHANGES} onRestore={onRestore} />);

    fireEvent.click(screen.getByTestId('commit-modal-restore-table-old_table'));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith('table', 'old_table'));
  });

  test('only the row being restored shows its pending state', async () => {
    // Keyed by `type:name` rather than a boolean — the list can hold several
    // deletions at once, and a shared flag would spin all of them.
    let release;
    const onRestore = jest.fn(() => new Promise(resolve => (release = resolve)));
    const two = [
      { name: 'a', type: 'table', status: 'deleted' },
      { name: 'b', type: 'table', status: 'deleted' },
    ];
    render(<PendingChangesList changes={two} onRestore={onRestore} />);

    fireEvent.click(screen.getByTestId('commit-modal-restore-table-a'));

    await screen.findByText('Restoring…');
    expect(screen.getByTestId('commit-modal-restore-table-b')).toHaveTextContent('Undo');

    // Let it finish inside the test, so the state update that clears the row
    // lands here rather than after teardown.
    await act(async () => release());
    expect(screen.getByTestId('commit-modal-restore-table-a')).toHaveTextContent('Undo');
  });
});

test('says so when there is nothing to commit', () => {
  render(<PendingChangesList changes={[]} />);

  expect(screen.getByText('No pending changes to commit.')).toBeInTheDocument();
});

test('the empty message is overridable, because the two panels word it differently', () => {
  render(<PendingChangesList changes={[]} emptyMessage="Nothing staged." />);

  expect(screen.getByText('Nothing staged.')).toBeInTheDocument();
});
