/* eslint-disable no-template-curly-in-string */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MissingRelationCard, AmbiguousRelationCard } from './InsightPreviewRelationCards';
import useStore from '../../../stores/store';

// Mount the REAL JoinOperatorPopover (VIS-1006) — only the store is mocked —
// so this is a unit-level integration test of the inline "draw the join" flow:
// card -> popover seeded with the model pair -> saveRelation -> re-run callback.
jest.mock('../../../stores/store');

const MODELS = [
  { name: 'orders', columns: ['id', 'user_id'] },
  { name: 'users', columns: ['id', 'email'] },
];

const mockSaveRelation = jest.fn();
const mockFetchModels = jest.fn();
const mockFetchRelations = jest.fn();

const buildState = (overrides = {}) => ({
  models: MODELS,
  fetchModels: mockFetchModels,
  saveRelation: mockSaveRelation,
  relations: [],
  fetchRelations: mockFetchRelations,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveRelation.mockResolvedValue({ success: true });
  useStore.mockImplementation(selector => selector(buildState()));
});

describe('MissingRelationCard', () => {
  it('renders the card with the offending model pair', () => {
    render(<MissingRelationCard models={['orders', 'users']} onRelationSaved={jest.fn()} />);
    expect(screen.getByTestId('missing-relation-card')).toBeInTheDocument();
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
  });

  it('opens the JoinOperatorPopover seeded with the two models when "Draw the join" is clicked', () => {
    render(<MissingRelationCard models={['orders', 'users']} onRelationSaved={jest.fn()} />);

    expect(screen.queryByTestId('join-operator-popover')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('missing-relation-draw-join'));

    // The real popover renders, pre-seeded with both model endpoints so the
    // user only has to pick columns.
    expect(screen.getByTestId('join-operator-popover')).toBeInTheDocument();
    expect(screen.getByTestId('join-endpoint-a-column-select')).not.toBeDisabled();
    expect(screen.getByTestId('join-endpoint-b-column-select')).not.toBeDisabled();
  });

  it('saves the relation and fires onRelationSaved (re-run trigger) on save', async () => {
    const onRelationSaved = jest.fn();
    render(<MissingRelationCard models={['orders', 'users']} onRelationSaved={onRelationSaved} />);

    fireEvent.click(screen.getByTestId('missing-relation-draw-join'));

    // Pick a column on each side so a condition can be built.
    fireEvent.change(screen.getByTestId('join-endpoint-a-column-select'), {
      target: { value: 'user_id' },
    });
    fireEvent.change(screen.getByTestId('join-endpoint-b-column-select'), {
      target: { value: 'id' },
    });

    fireEvent.click(screen.getByTestId('join-popover-save'));

    await waitFor(() => {
      expect(mockSaveRelation).toHaveBeenCalledTimes(1);
    });
    const [, config] = mockSaveRelation.mock.calls[0];
    expect(config.condition).toBe('${ref(orders).user_id} = ${ref(users).id}');

    await waitFor(() => {
      expect(onRelationSaved).toHaveBeenCalled();
    });
  });
});

describe('AmbiguousRelationCard', () => {
  it('lists candidate relations connecting the two models', () => {
    useStore.mockImplementation(selector =>
      selector(
        buildState({
          relations: [
            { name: 'a_to_d_via_b', condition: '${ref(a).id} = ${ref(d).a_id}' },
            { name: 'unrelated', condition: '${ref(x).id} = ${ref(y).x_id}' },
          ],
        })
      )
    );

    render(<AmbiguousRelationCard models={['a', 'd']} onRelationSaved={jest.fn()} />);
    expect(screen.getByTestId('ambiguous-relation-card')).toBeInTheDocument();
    expect(screen.getByTestId('ambiguous-relation-option-a_to_d_via_b')).toBeInTheDocument();
    expect(screen.queryByTestId('ambiguous-relation-option-unrelated')).not.toBeInTheDocument();
  });

  it('saves the picked relation as default and fires onRelationSaved', async () => {
    const onRelationSaved = jest.fn();
    useStore.mockImplementation(selector =>
      selector(
        buildState({
          relations: [{ name: 'a_to_d', condition: '${ref(a).id} = ${ref(d).a_id}' }],
        })
      )
    );

    render(<AmbiguousRelationCard models={['a', 'd']} onRelationSaved={onRelationSaved} />);
    fireEvent.click(screen.getByTestId('ambiguous-relation-option-a_to_d'));

    await waitFor(() => {
      expect(mockSaveRelation).toHaveBeenCalledTimes(1);
    });
    const [name, config] = mockSaveRelation.mock.calls[0];
    expect(name).toBe('a_to_d');
    expect(config.is_default).toBe(true);

    await waitFor(() => {
      expect(onRelationSaved).toHaveBeenCalled();
    });
  });

  it('shows an empty state when no candidate relations exist', () => {
    useStore.mockImplementation(selector => selector(buildState({ relations: [] })));
    render(<AmbiguousRelationCard models={['a', 'd']} onRelationSaved={jest.fn()} />);
    expect(screen.getByTestId('ambiguous-relation-empty')).toBeInTheDocument();
  });
});
