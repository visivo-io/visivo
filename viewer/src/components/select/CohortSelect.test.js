import { render, screen, waitFor, act } from '@testing-library/react';
import CohortSelect, { generateNewTraceDataFromSelection } from './CohortSelect'
import selectEvent from 'react-select-event'
import { withProviders } from '../../utils/test-utils';
import { createBrowserHistory } from 'history';
import { unstable_HistoryRouter as HistoryRouter } from 'react-router-dom';

const tracesData = {
  "Trace Name 1": {
    "Cohort Name 1": {},
    "Cohort Name 2": {}
  },
  "Trace Name 2": {
    "Cohort Name 3": {},
  }
};

test('renders without selector', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<CohortSelect
    tracesData={tracesData}
    showLabel
    parentType={"table"}
    onChange={onChange} />, { wrapper: withProviders });

  const selectWrapper = screen.getByLabelText('Selector')
  await act(() => selectEvent.select(selectWrapper, 'Cohort Name 1'));

  await waitFor(() => {
    expect(selectedTraceData).toEqual(
      {
        "Trace Name 1": {
          "Cohort Name 1": {},
        },
      })
  })
  expect(screen.queryByText('cohortName2')).not.toBeInTheDocument();
});

test('renders single select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  let visible = null;
  const onVisible = (value) => { visible = value }
  render(<CohortSelect
    tracesData={tracesData}
    showLabel
    onVisible={onVisible}
    selector={{ type: "single", name: "selector" }}
    onChange={onChange} />, { wrapper: withProviders });

  const selectWrapper = screen.getByLabelText('Selector')
  await act(() => selectEvent.select(selectWrapper, 'Cohort Name 1'));

  await waitFor(() => {
    expect(selectedTraceData).toEqual(
      {
        "Trace Name 1": {
          "Cohort Name 1": {},
        },
      })
  })
  expect(screen.queryByText('cohortName2')).not.toBeInTheDocument();
  expect(visible).toEqual(true);
});

test('renders with push to history', async () => {
  let history = createBrowserHistory();
  render(<HistoryRouter history={history}>
    <CohortSelect
      tracesData={tracesData}
      showLabel
      alwaysPushSelectionToUrl={true}
      onVisible={() => { }}
      selector={{ type: "single", name: "selector" }}
      onChange={() => { }} />
  </HistoryRouter>);

  const selectWrapper = screen.getByLabelText('Selector')
  await act(() => selectEvent.select(selectWrapper, 'Cohort Name 1'));

  await waitFor(() => {
    expect(history.location.search).toEqual('?selector=Cohort+Name+1')
  });
});

test('renders multiselect select', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<CohortSelect
    tracesData={tracesData}
    isMulti
    showLabel
    onChange={onChange}
    selector={{ type: "multiple", name: "multiple" }}
    name={"Chart"} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(selectedTraceData).toEqual(tracesData)
  })
  expect(screen.getByText('Cohort Name 2')).toBeInTheDocument();
  const selectWrapper = screen.getByLabelText('Selector')
  await act(() => selectEvent.select(selectWrapper, 'Cohort Name 2'));
});

test('renders without data', async () => {
  let selectedTraceData = null;
  const onChange = (value) => { selectedTraceData = value }
  render(<CohortSelect
    tracesData={{
      "Trace Name 1": {
      },
    }}
    showLabel
    onChange={onChange}
    selector={{ type: "single", name: "multiple" }}
    name={"Chart"} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(selectedTraceData).toEqual({})
  })
});

test('renders not visible', async () => {
  let visible = null;
  const onVisible = (value) => { visible = value }
  const onChange = () => { }
  render(<CohortSelect
    tracesData={{
      "Trace Name 1": {
      },
    }}
    showLabel
    onChange={onChange}
    parentName={"selectorParentName"}
    onVisible={onVisible}
    selector={{ type: "single", name: "multiple", parent: { name: "parentName" } }}
    name={"Chart"} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(visible).toEqual(false)
  })
});

describe('generateNewTraceDataFromSelection', () => {
  test('no names given', async () => {
    const newTracesData = generateNewTraceDataFromSelection(tracesData, null)
    expect(newTracesData).toEqual({});
  });

  test('select object', async () => {
    const newTracesData = generateNewTraceDataFromSelection(tracesData, ["Cohort Name 1"])
    expect(newTracesData).toEqual({ "Trace Name 1": { "Cohort Name 1": {} } });
  });
});


