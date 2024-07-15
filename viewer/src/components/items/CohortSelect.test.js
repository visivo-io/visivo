import { render, screen, waitFor } from '@testing-library/react';
import CohortSelect, { generateNewSearchParams, generateNewTraceDataFromSelection } from './CohortSelect'
import selectEvent from 'react-select-event'
import { withProviders } from '../../utils/test-utils';

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

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, 'Cohort Name 1')

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
  render(<CohortSelect
    tracesData={tracesData}
    showLabel
    selector={{ type: "single", name: "selector" }}
    onChange={onChange} />, { wrapper: withProviders });

  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, 'Cohort Name 1')

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
  const selectWrapper = screen.getByLabelText('Traces')
  await selectEvent.select(selectWrapper, 'Cohort Name 2')
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

describe('generateNewSearchParams', () => {
  test('selects single choice', async () => {
    const name = "Component"
    const previousSearchParams = new URLSearchParams({ "Component": "value" })
    const selectedOptions = { value: "selected", label: "selected" }
    const defaultOptions = { value: "default", label: "default" }
    const newSearchParams = generateNewSearchParams(previousSearchParams, name, selectedOptions, defaultOptions)

    expect(newSearchParams).toEqual(new URLSearchParams({ "Component": "selected" }))
  });

  test('selects nothing when equal to default', async () => {
    const name = "Component"
    const previousSearchParams = new URLSearchParams({ "Component": "value" })
    const selectedOptions = { value: "default", label: "default" }
    const defaultOptions = { value: "default", label: "default" }
    const newSearchParams = generateNewSearchParams(previousSearchParams, name, selectedOptions, defaultOptions)

    expect(newSearchParams).toEqual(new URLSearchParams({}))
  });

  test('selects multi choice', async () => {
    const name = "Component"
    const previousSearchParams = new URLSearchParams({ "Component": "value" })
    const selectedOptions = [{ value: "selected", label: "selected" }]
    const defaultOptions = [{ value: "default", label: "default" }]
    const newSearchParams = generateNewSearchParams(previousSearchParams, name, selectedOptions, defaultOptions)

    expect(newSearchParams).toEqual(new URLSearchParams({ "Component": "selected" }))
  });

  test('selects no choices', async () => {
    const name = "Component"
    const previousSearchParams = new URLSearchParams({ "Component": "value" })
    const selectedOptions = []
    const defaultOptions = [{ value: "default", label: "default" }]
    const newSearchParams = generateNewSearchParams(previousSearchParams, name, selectedOptions, defaultOptions)

    expect(newSearchParams).toEqual(new URLSearchParams({ "Component": "NoCohorts" }))
  });
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