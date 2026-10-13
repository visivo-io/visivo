/* eslint-disable no-template-curly-in-string -- literal Visivo `${ref(...)}` strings are the data under test */
/**
 * The SAME edit, in both interaction editors, produces byte-identical stored
 * values.
 *
 * That is the dossier's acceptance criterion for M6, and until this file it was
 * asserted only in prose. The test that carried the claim in its name compared
 * `INTERACTION_TYPE_OPTIONS` to itself, with the other editor never rendered:
 * if the two save paths drifted — one dropping the slice, one forgetting to
 * re-wrap, one repairing a double-wrap the other left alone — every test in the
 * change would still have passed.
 *
 * So this one renders BOTH:
 *
 *   - `InsightEditForm`, the right-rail editor, which collects interactions in
 *     form state and writes them through `onSave` as `{[type]: value}`;
 *   - `InsightBuildSection`, the Explorer Build rail, which writes each
 *     keystroke straight to the store through `updateInsightInteraction`.
 *
 * Two different owners, two different write shapes, one string that has to
 * match. Both are driven through their real `RefTextArea` slot (stubbed to a
 * plain textarea, as both editors' own suites already stub it) so the edit is
 * the user's edit, not a direct call into the codec.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import InsightEditForm from './InsightEditForm';
import InsightBuildSection from '../workspace/InsightBuildSection';
import useStore, { ObjectStatus } from '../../../stores/store';

jest.mock('./TracePropsEditor', () => ({
  __esModule: true,
  default: ({ props }) => <div data-testid="trace-props-editor">{props?.type}</div>,
}));

jest.mock('./RefTextArea', () => ({
  __esModule: true,
  default: ({ label, value, onChange }) => (
    <textarea
      aria-label={label || 'ref'}
      data-testid="ref-textarea"
      value={value || ''}
      onChange={e => onChange?.(e.target.value)}
    />
  ),
}));

jest.mock('../../../hooks/useDebounce', () => ({
  __esModule: true,
  useDebounce: v => v,
  default: v => v,
}));

jest.mock('../workspace/saveAsMetricFlow', () => ({
  ...jest.requireActual('../workspace/saveAsMetricFlow'),
  saveAsMetric: jest.fn(),
}));

jest.mock('../../../schemas/schemas', () => ({
  CHART_TYPES: [
    { value: 'scatter', label: 'Scatter / Line' },
    { value: 'bar', label: 'Bar' },
  ],
}));

/**
 * Every stored shape that reaches an interaction field, paired with the body
 * the author then types over it. Slices, padding, double wraps: the places the
 * two editors could disagree.
 */
const CASES = [
  {
    label: 'a plain wrapped value, retyped',
    stored: '?{${ref(orders).region}}',
    typed: '${ref(orders).region} = 1',
  },
  {
    label: 'a SLICED value — the slice must survive editing the body',
    stored: '?{${ref(daily).value}}[0]',
    typed: '${ref(daily).value} DESC',
  },
  {
    label: 'a range-sliced value',
    stored: '?{${ref(daily).value}}[1:5]',
    typed: 'sum(${ref(daily).value})',
  },
  {
    label: 'a padded value',
    stored: '?{   ${ref(orders).month}   }',
    typed: '${ref(orders).month} ASC',
  },
  {
    label: 'a value an earlier double-wrapping write corrupted (M24)',
    stored: '?{?{${ref(orders).region}}}',
    typed: '${ref(orders).region} = 2',
  },
  {
    label: 'a body typed with its own wrapper, as the docs publish it',
    stored: '?{${ref(orders).month}}',
    typed: '?{ ${ref(orders).month} DESC }',
  },
];

const rightRailWrite = async ({ stored, typed }) => {
  const onSave = jest.fn(async () => ({ success: true }));
  const utils = render(
    <InsightEditForm
      insight={{
        name: 'rev',
        status: ObjectStatus.PUBLISHED,
        config: { name: 'rev', props: { type: 'bar' }, interactions: [{ filter: stored }] },
      }}
      isCreate={false}
      onClose={jest.fn()}
      onSave={onSave}
    />
  );
  await screen.findByTestId('trace-props-editor');

  const field = screen.getByTestId('ref-textarea');
  const shownBody = field.value;
  fireEvent.change(field, { target: { value: typed } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  const [, , config] = onSave.mock.calls[0];
  const written = config.interactions ? config.interactions[0].filter : null;
  utils.unmount();
  return { shownBody, written };
};

const buildRailWrite = async ({ stored, typed }) => {
  const updateInsightInteraction = jest.fn();
  act(() => {
    useStore.setState({
      explorerInsightStates: {
        test_insight: {
          type: 'scatter',
          props: {},
          interactions: [{ type: 'filter', value: stored }],
          isNew: true,
        },
      },
      explorerActiveInsightName: 'test_insight',
      explorerChartInsightNames: ['test_insight'],
      explorerActiveModelName: 'orders',
      explorerModelTabs: ['orders'],
      explorerModelStates: {},
      models: [],
      metrics: [],
      dimensions: [],
      sources: [],
      updateInsightInteraction,
    });
  });

  const utils = render(
    <InsightBuildSection insightName="test_insight" isExpanded onToggleExpand={jest.fn()} />
  );
  const row = await screen.findByTestId('insight-interaction-0');
  const field = within(row).getByTestId('ref-textarea');
  const shownBody = field.value;
  fireEvent.change(field, { target: { value: typed } });

  const written = updateInsightInteraction.mock.calls.length
    ? updateInsightInteraction.mock.calls[0][2].value
    : null;
  utils.unmount();
  return { shownBody, written };
};

describe('the two interaction editors agree, byte for byte', () => {
  it.each(CASES)('$label', async ({ stored, typed }) => {
    const right = await rightRailWrite({ stored, typed });
    const build = await buildRailWrite({ stored, typed });

    // Both show the author the same thing before the edit...
    expect(build.shownBody).toBe(right.shownBody);
    // ...and neither shows the storage wrapper in the field.
    expect(right.shownBody).not.toMatch(/^\?\{/);
    // ...and both write the same string after it.
    expect(build.written).toBe(right.written);
  });

  it('clearing the body stores no expression in either editor', async () => {
    // The one place the two legitimately differ, stated so the difference is a
    // decision rather than a drift: the right rail saves a whole config, so an
    // empty interaction is DROPPED from it; the Build rail writes every
    // keystroke to the store, so it holds an empty string while the author is
    // mid-edit and the row stays on screen. Neither stores `?{}`.
    const cleared = { stored: '?{${ref(orders).month}}', typed: '   ' };
    const right = await rightRailWrite(cleared);
    const build = await buildRailWrite(cleared);

    expect(right.written).toBeNull();
    expect(build.written).toBe('');
    for (const value of [right.written, build.written]) {
      expect(value).not.toBe('?{}');
      expect(value).toBeFalsy();
    }
  });

  it('neither editor can produce a nested wrapper from any of these edits', async () => {
    const nested = [];
    for (const testCase of CASES) {
      const { written: rightWritten } = await rightRailWrite(testCase);
      const { written: buildWritten } = await buildRailWrite(testCase);
      for (const value of [rightWritten, buildWritten]) {
        if (typeof value === 'string' && /\?\{\s*\?\{/.test(value)) {
          nested.push(`${testCase.label}: ${value}`);
        }
      }
    }
    expect(nested).toEqual([]);
  });
});
