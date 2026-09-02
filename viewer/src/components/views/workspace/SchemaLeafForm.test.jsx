/**
 * SchemaLeafForm (VIS-996) — behavioral port of the retired bespoke
 * DimensionEditForm/MetricEditForm/RelationEditForm suites, now running against
 * the generic schema-driven leaf form. The field set renders from the REAL
 * published `$defs` through the real engine (FormShell → buildGroupSpec →
 * FieldGroupList); only the store, the save backbone, and RefTextArea are
 * mocked, exactly as the bespoke suites did.
 */
/* eslint-disable no-template-curly-in-string */
// Every valid expression and condition in this file carries a `${ref(...)}`,
// because that is what the rules under test require — inline disables would
// outnumber the assertions.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SchemaLeafForm from './SchemaLeafForm';
import * as renameApi from '../../../api/rename';

const mockActions = {
  saveDimension: jest.fn(),
  deleteDimension: jest.fn(),
  saveMetric: jest.fn(),
  deleteMetric: jest.fn(),
  saveRelation: jest.fn(),
  deleteRelation: jest.fn(),
  checkCommitStatus: jest.fn(),
  openWorkspaceTab: jest.fn(),
  closeWorkspaceTab: jest.fn(),
  fetchMetrics: jest.fn(),
  fetchCharts: jest.fn(),
};
const mockSaveNow = jest.fn();
const mockScheduleSave = jest.fn();
// Mutable so individual tests can drive the gate's status/errors surface.
let mockRecordSave;
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => mockRecordSave,
}));
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
  default: () => mockActions,
}));
jest.mock('../../../api/rename', () => ({
  fetchRenameImpact: jest.fn(),
  renameResource: jest.fn(),
  renameSupported: jest.fn(() => true),
}));
jest.mock('../common/RefTextArea', () => ({
  __esModule: true,
  default: ({ label, value, onChange, error }) => (
    <>
      <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
      {error && <span>{error}</span>}
    </>
  ),
}));

// The real project schema loads through a dynamic import — flush it.
const renderAndSettle = async ui => {
  const view = render(ui);
  await waitFor(() => expect(screen.queryByTestId('form-shell-loading')).not.toBeInTheDocument());
  return view;
};

const CASES = [
  {
    label: 'Dimension',
    type: 'dimension',
    word: 'dimension',
    nameLabel: /Dimension Name/,
    save: () => mockActions.saveDimension,
    del: () => mockActions.deleteDimension,
  },
  {
    label: 'Metric',
    type: 'metric',
    word: 'metric',
    nameLabel: /Metric Name/,
    save: () => mockActions.saveMetric,
    del: () => mockActions.deleteMetric,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  // `mockReturnValue` survives `clearAllMocks`, so a test that turns rename
  // off would otherwise leak into every later describe.
  renameApi.renameSupported.mockReturnValue(true);
  Object.values(mockActions).forEach(fn => fn.mockResolvedValue({ success: true }));
  mockSaveNow.mockResolvedValue({ success: true });
  mockScheduleSave.mockClear();
  mockRecordSave = {
    scheduleSave: mockScheduleSave,
    saveNow: mockSaveNow,
    status: 'idle',
    errors: null,
  };
});

// VIS-1209: a name change in edit mode is a RENAME, not a field edit — the
// name is the identity key for the store collection, the workspace tab, the
// URL and every `${ref()}`, so the server has to carry it and the user has to
// see what it touches first.
describe('renaming through the edit form', () => {
  const record = {
    name: 'orders',
    status: 'PUBLISHED',
    config: { name: 'orders', expression: 'sum(${ref(x).a})' },
  };

  const renderEdit = async () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      saveNow: mockSaveNow,
      status: 'idle',
      errors: null,
    };
    return renderAndSettle(
      <SchemaLeafForm type="metric" record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
  };

  beforeEach(() => {
    renameApi.renameSupported.mockReturnValue(true);
    renameApi.fetchRenameImpact.mockResolvedValue({
      supported: true,
      target: { type: 'metrics', name: 'orders', new_name: 'purchases', status: 'published' },
      references: [{ type: 'charts', name: 'c1', status: 'published' }],
    });
    renameApi.renameResource.mockResolvedValue({
      renamed: true,
      target: { type: 'metrics', name: 'orders', new_name: 'purchases' },
      references: [{ type: 'charts', name: 'c1', status: 'published' }],
    });
  });

  test('a changed name opens the impact dialog instead of saving', async () => {
    await renderEdit();

    fireEvent.change(screen.getByLabelText(/Metric Name/), { target: { value: 'purchases' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId('rename-impact-dialog')).toBeInTheDocument();
    expect(renameApi.fetchRenameImpact).toHaveBeenCalledWith('metrics', 'orders', 'purchases');
    // The ordinary save path must not also fire.
    expect(mockSaveNow).not.toHaveBeenCalled();
  });

  test('an unchanged name saves normally', async () => {
    await renderEdit();

    fireEvent.change(screen.getByLabelText('Expression'), {
      target: { value: 'sum(${ref(x).b})' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSaveNow).toHaveBeenCalled());
    expect(renameApi.fetchRenameImpact).not.toHaveBeenCalled();
  });

  test('cancelling leaves the object alone', async () => {
    await renderEdit();
    fireEvent.change(screen.getByLabelText(/Metric Name/), { target: { value: 'purchases' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByTestId('rename-impact-dialog');

    fireEvent.click(screen.getByTestId('rename-impact-cancel'));

    await waitFor(() =>
      expect(screen.queryByTestId('rename-impact-dialog')).not.toBeInTheDocument()
    );
    expect(renameApi.renameResource).not.toHaveBeenCalled();
  });

  test('confirming renames and re-points the open tab', async () => {
    await renderEdit();
    fireEvent.change(screen.getByLabelText(/Metric Name/), { target: { value: 'purchases' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByTestId('rename-impact-dialog');

    fireEvent.click(screen.getByTestId('rename-impact-confirm'));

    await waitFor(() =>
      expect(renameApi.renameResource).toHaveBeenCalledWith('metrics', 'orders', 'purchases')
    );
    // The tab and URL are keyed `type:name`, so both have to follow the rename.
    await waitFor(() =>
      expect(mockActions.closeWorkspaceTab).toHaveBeenCalledWith('metric:orders')
    );
    expect(mockActions.openWorkspaceTab).toHaveBeenCalledWith({
      id: 'metric:purchases',
      type: 'metric',
      name: 'purchases',
    });
  });

  test('a collision is shown in the dialog and nothing is renamed', async () => {
    renameApi.fetchRenameImpact.mockRejectedValue(
      Object.assign(new Error("A resource named 'purchases' already exists."), { status: 409 })
    );
    await renderEdit();

    fireEvent.change(screen.getByLabelText(/Metric Name/), { target: { value: 'purchases' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByTestId('rename-impact-error')).toHaveTextContent('already exists');
    expect(screen.getByTestId('rename-impact-confirm')).toBeDisabled();
    expect(renameApi.renameResource).not.toHaveBeenCalled();
  });

  test('a server without rename keeps the name field locked', async () => {
    renameApi.renameSupported.mockReturnValue(false);
    await renderEdit();

    expect(screen.getByLabelText(/Metric Name/)).toBeDisabled();
  });
});

describe.each(CASES)('SchemaLeafForm $label', ({ type, word, nameLabel, save, del }) => {
  // A project-level metric/dimension reaches a source only by naming a model,
  // so a valid expression always carries a ref.
  const VALID_EXPRESSION = 'sum(${ref(orders).amount})';
  const fillValid = () => {
    fireEvent.change(screen.getByLabelText(nameLabel), { target: { value: 'x1' } });
    fireEvent.change(screen.getByLabelText('Expression'), { target: { value: VALID_EXPRESSION } });
  };

  it('renders the create form from the published schema', async () => {
    await renderAndSettle(<SchemaLeafForm type={type} isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByLabelText(nameLabel)).toHaveValue('');
    // The required `expression` field comes from $defs.required → Essentials.
    expect(screen.getByLabelText('Expression')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('validates required name and expression', async () => {
    await renderAndSettle(<SchemaLeafForm type={type} isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save()).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Expression is required')).toBeInTheDocument();
  });

  it('saves a valid object and closes', async () => {
    const onClose = jest.fn();
    await renderAndSettle(
      <SchemaLeafForm type={type} isCreate onClose={onClose} onSave={jest.fn()} />
    );
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith(
        'x1',
        expect.objectContaining({ name: 'x1', expression: VALID_EXPRESSION })
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces a save failure', async () => {
    save().mockResolvedValueOnce({ success: false, error: 'dup name' });
    await renderAndSettle(<SchemaLeafForm type={type} isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('dup name')).toBeInTheDocument();
  });

  it('deletes in edit mode after confirmation', async () => {
    const onClose = jest.fn();
    const record = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(${ref(orders).a})' } };
    await renderAndSettle(
      <SchemaLeafForm type={type} record={record} onClose={onClose} onSave={jest.fn()} />
    );
    // The name is editable in edit mode now that a rename can carry the
    // `${ref()}` rewrite with it (VIS-1209); deleting is unaffected.
    expect(screen.getByLabelText(nameLabel)).toBeEnabled();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(del()).toHaveBeenCalledWith('x1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces a thrown save error and recovers the Save button', async () => {
    save().mockRejectedValueOnce(new Error('kaboom'));
    const onClose = jest.fn();
    await renderAndSettle(<SchemaLeafForm type={type} isCreate onClose={onClose} onSave={jest.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('kaboom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel dismisses the delete confirmation without deleting', async () => {
    const record = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(${ref(orders).a})' } };
    await renderAndSettle(
      <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByText(/mark it for deletion/i)).not.toBeInTheDocument();
    expect(del()).not.toHaveBeenCalled();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('shows the discard-unsaved-changes message when deleting a NEW object', async () => {
    const record = { name: 'x1', status: 'NEW', config: { name: 'x1', expression: 'sum(${ref(orders).a})' } };
    await renderAndSettle(
      <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/discard your unsaved changes/i)).toBeInTheDocument();
  });

  it('surfaces a delete failure and dismisses the confirm without closing', async () => {
    del().mockResolvedValueOnce({ success: false, error: 'still referenced' });
    const onClose = jest.fn();
    const record = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(${ref(orders).a})' } };
    await renderAndSettle(
      <SchemaLeafForm type={type} record={record} onClose={onClose} onSave={jest.fn()} />
    );
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(await screen.findByText('still referenced')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockActions.checkCommitStatus).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('embedded (inline within a model)', () => {
    const embeddedRecord = {
      name: 'x1',
      status: 'PUBLISHED',
      config: { name: 'x1', expression: 'amount * 2' },
      _embedded: { parentType: 'model', parentName: 'orders_model', path: `${word}s[0]` },
    };

    it('routes the save through the (type, name, config) onSave contract', async () => {
      const onSave = jest.fn().mockResolvedValue({ success: true });
      const onClose = jest.fn();
      await renderAndSettle(
        <SchemaLeafForm type={type} record={embeddedRecord} onClose={onClose} onSave={onSave} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          word,
          'x1',
          expect.objectContaining({ name: 'x1', expression: 'amount * 2' })
        )
      );
      expect(save()).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('surfaces an embedded save rejection with the fallback message', async () => {
      const onSave = jest.fn().mockResolvedValue({ success: false });
      await renderAndSettle(
        <SchemaLeafForm type={type} record={embeddedRecord} onClose={jest.fn()} onSave={onSave} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText(`Failed to save ${word}`)).toBeInTheDocument();
    });

    it('blocks ref() expressions with the inline-only error', async () => {
      const onSave = jest.fn();
      await renderAndSettle(
        <SchemaLeafForm type={type} record={embeddedRecord} onClose={jest.fn()} onSave={onSave} />
      );
      fireEvent.change(screen.getByLabelText('Expression'), {
          target: { value: 'sum(${ref(other_model)}.amount)' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(
        await screen.findByText(new RegExp(`A ${word} defined inside a model cannot use`))
      ).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('renders back navigation to the parent model and fires onGoBack', async () => {
      const onGoBack = jest.fn();
      await renderAndSettle(
        <SchemaLeafForm
          type={type}
          record={embeddedRecord}
          onClose={jest.fn()}
          onSave={jest.fn()}
          onGoBack={onGoBack}
        />
      );
      const backBtn = screen.getByRole('button', { name: /Model orders_model/ });
      fireEvent.click(backBtn);
      expect(onGoBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('edit mode — explicit Save through the gated backbone (VIS-993)', () => {
    const record = { name: 'existing', config: { name: 'existing', expression: 'ROUND(${ref(orders).x}, 2)' } };

    test('renders the Delete · Discard · Save footer', async () => {
      await renderAndSettle(
        <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
      );
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
      expect(screen.getByTitle('Delete')).toBeInTheDocument();
    });

    test('Save is gated on edits, then flushes the full config through saveNow', async () => {
      await renderAndSettle(
        <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
      );
      // Untouched: Save disabled, nothing persists.
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'ROUND(${ref(orders).x}, 3)' } });
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
      // No auto-save — nothing persists on keystroke.
      expect(mockSaveNow).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(mockSaveNow).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'existing', expression: 'ROUND(${ref(orders).x}, 3)' })
        )
      );
    });

    test('Discard reverts an edit to the last-saved value', async () => {
      await renderAndSettle(
        <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
      );
      const expr = screen.getByLabelText('Expression');
      expect(expr).toHaveValue('ROUND(${ref(orders).x}, 2)');
      fireEvent.change(expr, { target: { value: 'ROUND(x, 9)' } });
      expect(screen.getByLabelText('Expression')).toHaveValue('ROUND(x, 9)');
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(screen.getByLabelText('Expression')).toHaveValue('ROUND(${ref(orders).x}, 2)');
    });

    test('gate errors surface on the expression field', async () => {
      mockRecordSave = {
        scheduleSave: mockScheduleSave,
        saveNow: mockSaveNow,
        status: 'invalid',
        errors: [
          { path: 'expression', message: 'Expecting ). Line 1, Col: 25.', keyword: 'expression' },
        ],
      };
      await renderAndSettle(
        <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
      );
      expect(screen.getByText(/Expecting \)/)).toBeInTheDocument();
    });
  });
});

describe('SchemaLeafForm Relation', () => {
  it('renders create mode with the Condition expression widget and validates it', async () => {
    await renderAndSettle(
      <SchemaLeafForm type="relation" isCreate onClose={jest.fn()} onSave={jest.fn()} />
    );
    expect(screen.getByLabelText(/Relation Name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Condition')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockActions.saveRelation).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Condition is required')).toBeInTheDocument();
  });

  it('saves a valid relation and closes', async () => {
    const onClose = jest.fn();
    await renderAndSettle(
      <SchemaLeafForm type="relation" isCreate onClose={onClose} onSave={jest.fn()} />
    );
    fireEvent.change(screen.getByLabelText(/Relation Name/), { target: { value: 'orders_users' } });
    fireEvent.change(screen.getByLabelText('Condition'), {
      target: { value: '${ref(orders).user_id} = ${ref(users).id}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockActions.saveRelation).toHaveBeenCalledWith(
        'orders_users',
        expect.objectContaining({ name: 'orders_users' })
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('edit mode — a Save flushes the condition edit through the gated backbone', async () => {
    const record = {
      name: 'rel1',
      config: { name: 'rel1', condition: '${ref(orders).id} = ${ref(users).order_id}', join_type: 'inner' },
    };
    await renderAndSettle(
      <SchemaLeafForm type="relation" record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: '${ref(orders).id} = ${ref(users).oid}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockSaveNow).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'rel1', condition: '${ref(orders).id} = ${ref(users).oid}' })
      )
    );
  });

  it('gate errors surface on the condition field', async () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      saveNow: mockSaveNow,
      status: 'invalid',
      errors: [{ path: 'condition', message: 'Must reference at least two models.' }],
    };
    const record = { name: 'rel1', config: { name: 'rel1', condition: '${ref(orders).id} = ${ref(users).order_id}' } };
    await renderAndSettle(
      <SchemaLeafForm type="relation" record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    expect(screen.getByText('Must reference at least two models.')).toBeInTheDocument();
  });

  it('renders join_type from the schema enum (engine widget, not bespoke JSX)', async () => {
    const record = {
      name: 'rel1',
      config: { name: 'rel1', condition: '${ref(orders).id} = ${ref(users).order_id}', join_type: 'left' },
    };
    await renderAndSettle(
      <SchemaLeafForm type="relation" record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    // join_type is present in the config, so its engine row renders up-front.
    expect(screen.getByTestId('field-group-list')).toHaveTextContent(/join.?type/i);
  });
});

describe('SchemaLeafForm unknown-type resilience', () => {
  it('renders the FormShell empty state rather than crashing', async () => {
    render(<SchemaLeafForm type="nonsense" isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    // An unknown type never resolves a schema slice → FormShell drops to its
    // empty state (no loading spinner lingers).
    expect(await screen.findByTestId('form-shell-empty')).toBeInTheDocument();
  });
});



// `parentModel` is a SIBLING of `config`, not a field inside it — Metric and
// Dimension declare no `model` field and forbid extras, so nesting is only
// expressible positionally in the YAML. Building the save body as
// `{ ...config, name }` dropped it, the object validated as standalone, and
// `project_writer` wrote it at the top level: an ordinary save silently
// un-nested a field from its model.
describe('SchemaLeafForm — a model-scoped field keeps its parent on save', () => {
  const edit = record =>
    render(<SchemaLeafForm type="dimension" record={record} onClose={jest.fn()} onSave={jest.fn()} />);

  test('the save body carries parentModel through', async () => {
    edit({ name: 'gdp2', parentModel: 'new-model', config: { expression: 'gdp' } });
    fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'gdp * 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSaveNow).toHaveBeenCalled());
    expect(mockSaveNow).toHaveBeenCalledWith(
      expect.objectContaining({ parentModel: 'new-model' })
    );
  });

  test('a standalone field sends no parentModel', async () => {
    edit({ name: 'region', config: { expression: '${ref(orders).region}' } });
    fireEvent.change(screen.getByLabelText('Expression'), {
      target: { value: 'upper(${ref(orders).region})' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSaveNow).toHaveBeenCalled());
    expect(mockSaveNow.mock.calls[0][0]).not.toHaveProperty('parentModel');
  });
});
