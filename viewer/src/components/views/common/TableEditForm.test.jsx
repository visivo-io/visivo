/**
 * TableEditForm tests.
 *
 * Pins two regressions:
 *  - the fetch-if-empty mount effect must not re-fire forever when the project
 *    legitimately has zero insights/models (the store writes a FRESH array on
 *    every fetch, so emptiness alone re-triggers the effect);
 *  - a config that (invalidly) sets BOTH a data ref and pivot fields must keep
 *    both sections visible so the validation error can be seen and resolved.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TableEditForm from './TableEditForm';
import useStore from '../../../stores/store';

// The pivot RefListField editors are exercised by their own tests — keep this
// file focused on the form logic (matches editForms.smoke.test.jsx).
jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ value, onChange }) => (
    <textarea aria-label="ref" value={value || ''} onChange={e => onChange?.(e.target.value)} />
  ),
}));

const seed = (overrides = {}) => {
  act(() => {
    useStore.setState({
      deleteTable: jest.fn(async () => ({ success: true })),
      checkCommitStatus: jest.fn(async () => {}),
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

  test('shows BOTH sections and surfaces the validation error on Save', async () => {
    seed({
      insights: [{ name: 'rev_insight' }],
      models: [{ name: 'm' }],
      fetchInsights: jest.fn(),
      fetchModels: jest.fn(),
    });
    const onSave = jest.fn(async () => ({ success: true }));
    renderForm({ table: conflictedTable, isCreate: false, onSave });

    // Both sections must stay visible so the user can remove one of the two.
    expect(screen.getByText('Data Source')).toBeInTheDocument();
    expect(screen.getByText('Pivot Configuration')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Cannot use both data source and columns/rows/values')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
