import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import selectEvent from 'react-select-event';
import DashboardEditForm from './DashboardEditForm';
import useStore from '../../../stores/store';

jest.mock('../../../stores/store');

// Render the REAL RefDropZone but capture each slot's `onChange` by id. The
// shell DndContext (G-1) performs the drop write by invoking exactly this
// callback, so tests call it to simulate a drop landing in a slot.
const mockRefDropZoneOnChange = {};
jest.mock('./RefDropZone', () => {
  const ReactActual = jest.requireActual('react');
  const ActualRefDropZone = jest.requireActual('./RefDropZone').default;
  const CapturingRefDropZone = props => {
    mockRefDropZoneOnChange[props.id] = props.onChange;
    return ReactActual.createElement(ActualRefDropZone, props);
  };
  return { __esModule: true, default: CapturingRefDropZone };
});

const mockOpenWorkspaceTab = jest.fn();
const mockDeleteDashboard = jest.fn();
const mockCheckPublishStatus = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useStore.mockImplementation(selector => {
    const state = {
      deleteDashboard: mockDeleteDashboard,
      checkCommitStatus: mockCheckPublishStatus,
      openWorkspaceTab: mockOpenWorkspaceTab,
    };
    return typeof selector === 'function' ? selector(state) : state;
  });
});

const dashboardWithRows = {
  name: 'sales',
  status: 'published',
  config: {
    description: 'Sales overview',
    rows: [
      {
        height: 'large',
        items: [{ width: 2, chart: 'ref(rev_chart)' }, { width: 1 }],
      },
    ],
  },
};

describe('DashboardEditForm — bundled context (mounts RowEditForm per row)', () => {
  test('renders name, description, and a RowEditForm per configured row', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByDisplayValue('sales')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sales overview')).toBeInTheDocument();
    expect(screen.getByTestId('row-edit-form-0')).toBeInTheDocument();
    expect(screen.getByText('Row 1')).toBeInTheDocument();
    // Item slots are RefDropZones with the canonical id scheme.
    expect(screen.getByTestId('ref-dropzone-row-0-item-0')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByTestId('ref-dropzone-row-0-item-1')).toHaveAttribute('data-filled', 'false');
  });

  test('the chart ref renders as a pill in its slot', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('rev_chart')).toBeInTheDocument();
  });

  test('Add Row appends a row (identical behavior to before refactor)', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={true} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.queryByTestId('row-edit-form-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Row'));
    expect(screen.getByTestId('row-edit-form-1')).toBeInTheDocument();
  });

  test('empty dashboard shows the no-rows hint', () => {
    render(<DashboardEditForm dashboard={null} isCreate={true} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText(/No rows defined/i)).toBeInTheDocument();
  });

  test('save serializes rows with refs in ref(...) form (unchanged contract)', async () => {
    const onSave = jest.fn().mockResolvedValue({ success: true });
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={onSave} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [objType, objName, config] = onSave.mock.calls[0];
    expect(objType).toBe('dashboard');
    expect(objName).toBe('sales');
    expect(config.rows).toHaveLength(1);
    expect(config.rows[0].height).toBe('large');
    // Only the populated item survives; width preserved; chart ref kept.
    expect(config.rows[0].items).toEqual([{ width: 2, chart: 'ref(rev_chart)' }]);
  });

  test('clicking a slot pill opens the referenced object via openWorkspaceTab', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('rev_chart'));
    expect(mockOpenWorkspaceTab).toHaveBeenCalledWith({ type: 'chart', name: 'rev_chart' });
  });

  test('removing a slot pill clears the ref (slot reverts to empty)', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByTestId('ref-dropzone-row-0-item-0')).toHaveAttribute('data-filled', 'true');
    fireEvent.click(screen.getByTestId('pill-remove'));
    expect(screen.getByTestId('ref-dropzone-row-0-item-0')).toHaveAttribute('data-filled', 'false');
  });

  test('Save button keeps the onboarding anchor data attribute', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={true} onSave={jest.fn()} onClose={jest.fn()} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('data-onb-target', 'dashboard-save');
  });
});

describe('DashboardEditForm — create mode & save failures', () => {
  test('typed name and description are trimmed into the saved config (no delete button in create)', async () => {
    const onSave = jest.fn().mockResolvedValue({ success: true });
    render(<DashboardEditForm dashboard={null} isCreate={true} onSave={onSave} onClose={jest.fn()} />);

    expect(screen.queryByTitle('Delete dashboard')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  exec_summary  ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' Weekly KPIs ' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [objType, objName, config] = onSave.mock.calls[0];
    expect(objType).toBe('dashboard');
    expect(objName).toBe('exec_summary');
    expect(config.description).toBe('Weekly KPIs');
    expect(config.rows).toEqual([]);
  });

  test('a failed save surfaces the backend error (with fallback message)', async () => {
    const onSave = jest
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'dashboard rejected' })
      .mockResolvedValueOnce({ success: false });
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('dashboard rejected')).toBeInTheDocument();

    // A rejection with no message falls back to the generic error.
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Failed to save dashboard')).toBeInTheDocument();
  });
});

describe('DashboardEditForm — delete flows', () => {
  test('confirm delete removes the dashboard, refreshes commit status, and closes', async () => {
    mockDeleteDashboard.mockResolvedValueOnce({ success: true });
    const onClose = jest.fn();
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Delete dashboard'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Confirm Delete'));

    await waitFor(() => expect(mockDeleteDashboard).toHaveBeenCalledWith('sales'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCheckPublishStatus).toHaveBeenCalled();
  });

  test('a NEW dashboard warns about discarding unsaved changes instead', () => {
    render(
      <DashboardEditForm
        dashboard={{ ...dashboardWithRows, status: 'new' }}
        isCreate={false}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Delete dashboard'));
    expect(screen.getByText(/discard your unsaved changes/i)).toBeInTheDocument();
  });

  test('a failed delete surfaces the error and dismisses the confirm without closing', async () => {
    mockDeleteDashboard.mockResolvedValueOnce({ success: false, error: 'dashboard is referenced' });
    const onClose = jest.fn();
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Delete dashboard'));
    fireEvent.click(screen.getByText('Confirm Delete'));

    expect(await screen.findByText('dashboard is referenced')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
    expect(mockCheckPublishStatus).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('a thrown delete error surfaces its message', async () => {
    mockDeleteDashboard.mockRejectedValueOnce(new Error('network down'));
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete dashboard'));
    fireEvent.click(screen.getByText('Confirm Delete'));

    expect(await screen.findByText('network down')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
  });

  test('cancel dismisses the confirmation without deleting', () => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={jest.fn()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByTitle('Delete dashboard'));
    expect(screen.getByText(/mark it for deletion/i)).toBeInTheDocument();
    // The confirm box renders above the footer, so its Cancel comes first.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(screen.queryByText(/mark it for deletion/i)).not.toBeInTheDocument();
    expect(mockDeleteDashboard).not.toHaveBeenCalled();
    // The delete affordance returns once the confirm is dismissed.
    expect(screen.getByTitle('Delete dashboard')).toBeInTheDocument();
  });
});

describe('DashboardEditForm — row & item editing', () => {
  const mountWithSave = (onSave = jest.fn().mockResolvedValue({ success: true })) => {
    render(<DashboardEditForm dashboard={dashboardWithRows} isCreate={false} onSave={onSave} onClose={jest.fn()} />);
    return onSave;
  };

  const saveAndGetConfig = async onSave => {
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    return onSave.mock.calls[0][2];
  };

  test('removing the row shows the no-rows hint and serializes empty rows', async () => {
    const onSave = mountWithSave();
    fireEvent.click(screen.getByLabelText('Remove row 1'));
    expect(screen.getByText(/No rows defined/i)).toBeInTheDocument();
    const config = await saveAndGetConfig(onSave);
    expect(config.rows).toEqual([]);
  });

  test('changing the row height serializes the new height', async () => {
    const onSave = mountWithSave();
    await selectEvent.select(screen.getByLabelText('Row 1 height'), 'small', {
      container: document.body,
    });
    const config = await saveAndGetConfig(onSave);
    expect(config.rows[0].height).toBe('small');
  });

  test('Add Item appends an empty slot to the row', () => {
    mountWithSave();
    expect(screen.queryByTestId('ref-dropzone-row-0-item-2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Item'));
    expect(screen.getByTestId('ref-dropzone-row-0-item-2')).toHaveAttribute('data-filled', 'false');
  });

  test('removing an item drops its slot and it never reaches the saved config', async () => {
    const onSave = mountWithSave();
    fireEvent.click(screen.getByLabelText('Remove item 2'));
    expect(screen.queryByTestId('ref-dropzone-row-0-item-1')).not.toBeInTheDocument();
    const config = await saveAndGetConfig(onSave);
    expect(config.rows[0].items).toEqual([{ width: 2, chart: 'ref(rev_chart)' }]);
  });

  test('changing an item width serializes the numeric width', async () => {
    const onSave = mountWithSave();
    fireEvent.change(screen.getByLabelText('Item 1 width'), { target: { value: '3' } });
    const config = await saveAndGetConfig(onSave);
    expect(config.rows[0].items[0]).toEqual({ width: 3, chart: 'ref(rev_chart)' });
  });

  test('a dropped ref fills the empty slot and serializes (shell drop contract)', async () => {
    const onSave = mountWithSave();

    act(() => {
      mockRefDropZoneOnChange['row-0-item-1']({ type: 'table', name: 'sales_table' });
    });

    expect(screen.getByTestId('ref-dropzone-row-0-item-1')).toHaveAttribute('data-filled', 'true');
    expect(screen.getByText('sales_table')).toBeInTheDocument();

    const config = await saveAndGetConfig(onSave);
    // VIS-993: refs are written through itemMutations in the serialized
    // ${ref()} context form, and no scaffold keys (selector / empty-string
    // leaves) ever reach the saved config.
    expect(config.rows[0].items).toEqual([
      { width: 2, chart: 'ref(rev_chart)' },
      // eslint-disable-next-line no-template-curly-in-string
      { table: '${ref(sales_table)}' },
    ]);
    expect(JSON.stringify(config)).not.toContain('selector');
  });
});
