import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RelationEditForm from './RelationEditForm';

// useStore() is called with no selector and destructured for actions.
const mockActions = {
  saveRelation: jest.fn(),
  deleteRelation: jest.fn(),
  checkCommitStatus: jest.fn(),
};
const mockSaveNow = jest.fn();
jest.mock('../../../hooks/useRecordSave', () => ({
  __esModule: true,
  default: () => ({ saveNow: mockSaveNow, status: 'idle', errors: null }),
}));
jest.mock('../../../stores/store', () => ({
  __esModule: true,
  ObjectStatus: { NEW: 'NEW', MODIFIED: 'MODIFIED', PUBLISHED: 'PUBLISHED', DELETED: 'DELETED' },
  default: () => mockActions,
}));
// RefTextArea is a 950-line ref-aware editor; stub it down to a labelled textarea.
jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ label, value, onChange, error }) => (
    <>
      <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} />
      {error && <span>{error}</span>}
    </>
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockActions.saveRelation.mockResolvedValue({ success: true });
  mockSaveNow.mockResolvedValue({ success: true });
  mockActions.deleteRelation.mockResolvedValue({ success: true });
  mockActions.checkCommitStatus.mockResolvedValue();
});

const fillValid = () => {
  fireEvent.change(screen.getByLabelText(/Relation Name/), { target: { value: 'rel1' } });
  fireEvent.change(screen.getByLabelText('Condition'), {
    /* eslint-disable-next-line no-template-curly-in-string */
    target: { value: '${ref(a).id} = ${ref(b).a_id}' },
  });
};

describe('RelationEditForm', () => {
  it('renders the create form with empty fields and a Save button', () => {
    render(<RelationEditForm isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.getByLabelText(/Relation Name/)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('blocks save and surfaces validation errors when required fields are empty', () => {
    render(<RelationEditForm isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockActions.saveRelation).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Condition is required')).toBeInTheDocument();
  });

  it('saves a valid relation and closes', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    render(<RelationEditForm isCreate onClose={onClose} onSave={onSave} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockActions.saveRelation).toHaveBeenCalledWith(
        'rel1',
        expect.objectContaining({ name: 'rel1', join_type: 'inner' })
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalled();
  });

  it('shows the server error when the save fails', async () => {
    mockActions.saveRelation.mockResolvedValueOnce({ success: false, error: 'duplicate name' });
    render(<RelationEditForm isCreate onClose={jest.fn()} onSave={jest.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('duplicate name')).toBeInTheDocument();
  });

  it('prefills in edit mode, disables the name, and deletes after confirm', async () => {
    const onClose = jest.fn();
    const relation = {
      name: 'rel1',
      status: 'PUBLISHED',
      config: { join_type: 'left', condition: 'x = y', is_default: true },
    };
    render(<RelationEditForm relation={relation} onClose={onClose} onSave={jest.fn()} />);

    const nameInput = screen.getByLabelText(/Relation Name/);
    expect(nameInput).toHaveValue('rel1');
    expect(nameInput).toBeDisabled();

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(mockActions.deleteRelation).toHaveBeenCalledWith('rel1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('edit-mode save routes through the gated backbone (VIS-993)', () => {
  const record = {
    name: 'orders_to_users',
    config: { name: 'orders_to_users', join_type: 'inner', condition: 'a.id = b.a_id' },
  };

  test('edit mode persists via useRecordSave.saveNow, never the raw store action', async () => {
    render(<RelationEditForm relation={record} onClose={jest.fn()} onSave={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mockSaveNow).toHaveBeenCalledTimes(1));
    expect(mockSaveNow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'orders_to_users', condition: 'a.id = b.a_id' })
    );
    expect(mockActions.saveRelation).not.toHaveBeenCalled();
  });

  test('a gate-blocked save maps the condition error onto the field', async () => {
    mockSaveNow.mockResolvedValue({
      success: false,
      validation: {
        errors: [
          { path: 'condition', message: "ref 'ghost_model' does not match any existing object", keyword: 'ref' },
        ],
      },
    });
    render(<RelationEditForm relation={record} onClose={jest.fn()} onSave={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/ghost_model/)).toBeInTheDocument();
    expect(mockActions.saveRelation).not.toHaveBeenCalled();
  });
});
