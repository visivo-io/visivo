/**
 * SchemaLeafForm (VIS-996) — behavioral port of the retired bespoke
 * DimensionEditForm/MetricEditForm/RelationEditForm suites, now running against
 * the generic schema-driven leaf form. The field set renders from the REAL
 * published `$defs` through the real engine (FormShell → buildGroupSpec →
 * FieldGroupList); only the store, the save backbone, and RefTextArea are
 * mocked, exactly as the bespoke suites did.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SchemaLeafForm from './SchemaLeafForm';

const mockActions = {
  saveDimension: jest.fn(),
  deleteDimension: jest.fn(),
  saveMetric: jest.fn(),
  deleteMetric: jest.fn(),
  saveRelation: jest.fn(),
  deleteRelation: jest.fn(),
  checkCommitStatus: jest.fn(),
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

describe.each(CASES)('SchemaLeafForm $label', ({ type, word, nameLabel, save, del }) => {
  const fillValid = () => {
    fireEvent.change(screen.getByLabelText(nameLabel), { target: { value: 'x1' } });
    fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'sum(amount)' } });
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
        expect.objectContaining({ name: 'x1', expression: 'sum(amount)' })
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
    const record = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(a)' } };
    await renderAndSettle(
      <SchemaLeafForm type={type} record={record} onClose={onClose} onSave={jest.fn()} />
    );
    expect(screen.getByLabelText(nameLabel)).toBeDisabled();
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
    const record = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(a)' } };
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
    const record = { name: 'x1', status: 'NEW', config: { name: 'x1', expression: 'sum(a)' } };
    await renderAndSettle(
      <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/discard your unsaved changes/i)).toBeInTheDocument();
  });

  it('surfaces a delete failure and dismisses the confirm without closing', async () => {
    del().mockResolvedValueOnce({ success: false, error: 'still referenced' });
    const onClose = jest.fn();
    const record = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(a)' } };
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
        // eslint-disable-next-line no-template-curly-in-string
        target: { value: 'sum(${ref(other_model)}.amount)' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(
        await screen.findByText(new RegExp(`Inline ${word}s cannot use ref\\(\\) expressions`))
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

  describe('edit mode auto-saves through the gated backbone (VIS-993)', () => {
    const record = { name: 'existing', config: { name: 'existing', expression: 'ROUND(x, 2)' } };

    test('renders NO Save button — persistence is debounced auto-save', async () => {
      await renderAndSettle(
        <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
      );
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    test('an expression edit schedules a debounced save with the full config', async () => {
      await renderAndSettle(
        <SchemaLeafForm type={type} record={record} onClose={jest.fn()} onSave={jest.fn()} />
      );
      fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'ROUND(x, 3)' } });
      expect(mockScheduleSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'existing', expression: 'ROUND(x, 3)' })
      );
      expect(mockSaveNow).not.toHaveBeenCalled();
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
      // eslint-disable-next-line no-template-curly-in-string
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

  it('edit mode auto-saves a condition edit through the gated backbone', async () => {
    const record = {
      name: 'rel1',
      config: { name: 'rel1', condition: 'a = b', join_type: 'inner' },
    };
    await renderAndSettle(
      <SchemaLeafForm type="relation" record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'a = c' } });
    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rel1', condition: 'a = c' })
    );
  });

  it('gate errors surface on the condition field', async () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      saveNow: mockSaveNow,
      status: 'invalid',
      errors: [{ path: 'condition', message: 'Must reference at least two models.' }],
    };
    const record = { name: 'rel1', config: { name: 'rel1', condition: 'a = b' } };
    await renderAndSettle(
      <SchemaLeafForm type="relation" record={record} onClose={jest.fn()} onSave={jest.fn()} />
    );
    expect(screen.getByText('Must reference at least two models.')).toBeInTheDocument();
  });

  it('renders join_type from the schema enum (engine widget, not bespoke JSX)', async () => {
    const record = {
      name: 'rel1',
      config: { name: 'rel1', condition: 'a = b', join_type: 'left' },
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
