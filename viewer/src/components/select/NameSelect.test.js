import { render, screen, waitFor } from '@testing-library/react';
import NameSelect, { generateNewSearchParams } from './NameSelect'
import selectEvent from 'react-select-event'
import { withProviders } from '../../utils/test-utils';
import { createBrowserHistory } from 'history';
import { unstable_HistoryRouter as HistoryRouter } from 'react-router-dom';


test('renders without selector', async () => {
  let selectedNames = null;
  const onChange = (value) => { selectedNames = value }
  render(<NameSelect
    names={["name1", "name2"]}
    showLabel
    parentType={"table"}
    onChange={onChange} />, { wrapper: withProviders });

  const selectWrapper = screen.getByLabelText('Selector')
  await selectEvent.select(selectWrapper, 'name1')

  await waitFor(() => {
    expect(selectedNames).toEqual("name1")
  })
  expect(screen.queryByText('name2')).not.toBeInTheDocument();
});

test('renders single select', async () => {
  let selectedNames = null;
  const onChange = (value) => { selectedNames = value }
  let visible = null;
  const onVisible = (value) => { visible = value }
  render(<NameSelect
    names={["name1", "name2"]}
    showLabel
    onVisible={onVisible}
    selector={{ type: "single", name: "selector" }}
    onChange={onChange} />, { wrapper: withProviders });

  const selectWrapper = screen.getByLabelText('Selector')
  await selectEvent.select(selectWrapper, 'name1')

  await waitFor(() => {
    expect(selectedNames).toEqual("name1")
  })
  expect(screen.queryByText('name2')).not.toBeInTheDocument();
  expect(visible).toEqual(true);
});

test('renders with push to history', async () => {
  let history = createBrowserHistory();
  render(<HistoryRouter history={history}>
    <NameSelect
      names={["name1", "name2"]}
      showLabel
      alwaysPushSelectionToUrl={true}
      onVisible={() => { }}
      selector={{ type: "single", name: "selector" }}
      onChange={() => { }} />
  </HistoryRouter>);

  const selectWrapper = screen.getByLabelText('Selector')
  await selectEvent.select(selectWrapper, 'name1')

  await waitFor(() => {
    expect(history.location.search).toEqual('?selector=name1')
  });
});

test('renders multiselect select', async () => {
  let selectedNames = null;
  const onChange = (value) => { selectedNames = value }
  render(<NameSelect
    names={["name1", "name2"]}
    isMulti
    showLabel
    onChange={onChange}
    selector={{ type: "multiple", name: "multiple" }}
    name={"Chart"} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(selectedNames).toEqual(["name1", "name2"])
  })
  expect(screen.getByText('name1')).toBeInTheDocument();
  const selectWrapper = screen.getByLabelText('Selector')
  await selectEvent.select(selectWrapper, 'name2')
});

test('renders not visible', async () => {
  let visible = null;
  const onVisible = (value) => { visible = value }
  const onChange = () => { }
  render(<NameSelect
    names={["name1", "name2"]}
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