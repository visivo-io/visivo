import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DimensionEditForm from './DimensionEditForm';
import MetricEditForm from './MetricEditForm';

// Dimension and Metric edit forms are structurally identical (name + Expression
// + Description, project-level save path in create mode). One parametrized suite
// covers both at interaction depth.
const mockActions = {
  saveDimension: jest.fn(),
  deleteDimension: jest.fn(),
  saveMetric: jest.fn(),
  deleteMetric: jest.fn(),
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
jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ label, value, onChange, error }) => (
    <>
      <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
      {error && <span>{error}</span>}
    </>
  ),
}));

const CASES = [
  {
    label: 'Dimension',
    Form: DimensionEditForm,
    prop: 'dimension',
    word: 'dimension',
    nameLabel: /Dimension Name/,
    save: () => mockActions.saveDimension,
    del: () => mockActions.deleteDimension,
  },
  {
    label: 'Metric',
    Form: MetricEditForm,
    prop: 'metric',
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
  mockRecordSave = { scheduleSave: mockScheduleSave, saveNow: mockSaveNow, status: 'idle', errors: null };
});

describe.each(CASES)('$label EditForm', ({ Form, prop, word, nameLabel, save, del }) => {
  const fillValid = () => {
    fireEvent.change(screen.getByLabelText(nameLabel), { target: { value: 'x1' } });
    fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'sum(amount)' } });
  };

  it('renders the create form', () => {
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByLabelText(nameLabel)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('validates required name and expression', () => {
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save()).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Expression is required')).toBeInTheDocument();
  });

  it('saves a valid object and closes', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    render(<Form isCreate onClose={onClose} onSave={onSave} />);
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
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('dup name')).toBeInTheDocument();
  });

  it('deletes in edit mode after confirmation', async () => {
    const onClose = jest.fn();
    const obj = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(a)' } };
    render(<Form {...{ [prop]: obj }} onClose={onClose} onSave={jest.fn()} />);
    expect(screen.getByLabelText(nameLabel)).toBeDisabled();
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(del()).toHaveBeenCalledWith('x1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('includes the description in the saved config', async () => {
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fillValid();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'my notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(save()).toHaveBeenCalledWith(
        'x1',
        expect.objectContaining({ name: 'x1', expression: 'sum(amount)', description: 'my notes' })
      )
    );
  });

  it('surfaces a thrown save error and recovers the Save button', async () => {
    save().mockRejectedValueOnce(new Error('kaboom'));
    const onClose = jest.fn();
    render(<Form isCreate onClose={onClose} onSave={jest.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('kaboom')).toBeInTheDocument();
    // Save recovered from the "Saving..." state and the panel stayed open.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel dismisses the delete confirmation without deleting', () => {
    const obj = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(a)' } };
    render(<Form {...{ [prop]: obj }} onClose={jest.fn()} onSave={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();
    // The confirm box renders above the footer, so its Cancel comes first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(screen.queryByText(/mark it for deletion/i)).not.toBeInTheDocument();
    expect(del()).not.toHaveBeenCalled();
    // The delete affordance returns once the confirm is dismissed.
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('shows the discard-unsaved-changes message when deleting a NEW object', () => {
    const obj = { name: 'x1', status: 'NEW', config: { name: 'x1', expression: 'sum(a)' } };
    render(<Form {...{ [prop]: obj }} onClose={jest.fn()} onSave={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByText(/discard your unsaved changes/i)).toBeInTheDocument();
  });

  it('surfaces a delete failure and dismisses the confirm without closing', async () => {
    del().mockResolvedValueOnce({ success: false, error: 'still referenced' });
    const onClose = jest.fn();
    const obj = { name: 'x1', status: 'PUBLISHED', config: { name: 'x1', expression: 'sum(a)' } };
    render(<Form {...{ [prop]: obj }} onClose={onClose} onSave={jest.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(await screen.findByText('still referenced')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument();
    expect(mockActions.checkCommitStatus).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('embedded (inline within a model)', () => {
    const embeddedObj = {
      name: 'x1',
      status: 'PUBLISHED',
      config: { name: 'x1', expression: 'amount * 2' },
      _embedded: { parentType: 'model', parentName: 'orders_model', path: `${word}s[0]` },
    };

    it('routes the save through the (type, name, config) onSave contract', async () => {
      const onSave = jest.fn().mockResolvedValue({ success: true });
      const onClose = jest.fn();
      render(<Form {...{ [prop]: embeddedObj }} onClose={onClose} onSave={onSave} />);
      // Embedded objects keep the name editable (they are authored inline).
      expect(screen.getByLabelText(nameLabel)).not.toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith(
          word,
          'x1',
          expect.objectContaining({ name: 'x1', expression: 'amount * 2' })
        )
      );
      // The project-level store save must NOT run for embedded objects, and the
      // parent (not this form) owns closing the panel.
      expect(save()).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('surfaces an embedded save rejection with the fallback message', async () => {
      const onSave = jest.fn().mockResolvedValue({ success: false });
      render(<Form {...{ [prop]: embeddedObj }} onClose={jest.fn()} onSave={onSave} />);
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText(`Failed to save ${word}`)).toBeInTheDocument();
    });

    it('blocks ref() expressions with the inline-only error', async () => {
      const onSave = jest.fn();
      render(<Form {...{ [prop]: embeddedObj }} onClose={jest.fn()} onSave={onSave} />);
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

    it('renders back navigation to the parent model and fires onGoBack', () => {
      const onGoBack = jest.fn();
      render(<Form {...{ [prop]: embeddedObj }} onClose={jest.fn()} onSave={jest.fn()} onGoBack={onGoBack} />);
      const backBtn = screen.getByRole('button', { name: /Model orders_model/ });
      fireEvent.click(backBtn);
      expect(onGoBack).toHaveBeenCalledTimes(1);
    });
  });
});

describe.each(CASES)('$label edit mode auto-saves through the gated backbone (VIS-993)', ({ Form, prop, word }) => {
  const record = { name: 'existing', config: { name: 'existing', expression: 'ROUND(x, 2)' } };

  test('renders NO Save button — persistence is debounced auto-save', () => {
    render(<Form {...{ [prop]: record }} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  test('an expression edit schedules a debounced save with the full config', () => {
    render(<Form {...{ [prop]: record }} onClose={jest.fn()} onSave={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Expression'), { target: { value: 'ROUND(x, 3)' } });

    expect(mockScheduleSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'existing', expression: 'ROUND(x, 3)' })
    );
    expect(mockSaveNow).not.toHaveBeenCalled();
  });

  test('gate errors surface on the expression field', () => {
    mockRecordSave = {
      scheduleSave: mockScheduleSave,
      saveNow: mockSaveNow,
      status: 'invalid',
      errors: [
        { path: 'expression', message: 'Expecting ). Line 1, Col: 25.', keyword: 'expression' },
      ],
    };
    render(<Form {...{ [prop]: record }} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByText(/Expecting \)/)).toBeInTheDocument();
  });

  test('create mode still uses an explicit Create button', () => {
    render(<Form isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Create|Save/ })).toBeInTheDocument();
  });
});
