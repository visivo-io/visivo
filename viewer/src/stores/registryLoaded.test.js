import useStore from './store';
import * as insightsApi from '../api/insights';
import * as modelsApi from '../api/models';

jest.mock('../api/insights');
jest.mock('../api/models');

const initialState = useStore.getState();

// `insightsLoaded` / `modelsLoaded` tell a registry that was never fetched from
// one that was fetched and is empty. `*Loading` cannot: it is false in both.
describe.each([
  ['insights', 'fetchInsights', 'insightsLoaded', 'insightsLoading', () => insightsApi.fetchAllInsights],
  ['models', 'fetchModels', 'modelsLoaded', 'modelsLoading', () => modelsApi.fetchAllModels],
])('%s registry loaded flag', (key, fetchName, loadedKey, loadingKey, api) => {
  beforeEach(() => {
    useStore.setState({ [key]: [], [loadedKey]: false, [loadingKey]: false });
  });

  it('is false before any fetch, while the list is empty and not loading', () => {
    expect(initialState[loadedKey]).toBe(false);
    expect(initialState[loadingKey]).toBe(false);
    expect(initialState[key]).toEqual([]);
  });

  it('stays false while the fetch is in flight and is true after an empty response', async () => {
    let resolve;
    api().mockReturnValue(new Promise(r => (resolve = r)));
    const pending = useStore.getState()[fetchName]();
    expect(useStore.getState()[loadedKey]).toBe(false);
    resolve({ [key]: [] });
    await pending;
    expect(useStore.getState()[loadedKey]).toBe(true);
    expect(useStore.getState()[key]).toEqual([]);
  });

  it('is true after a failed fetch', async () => {
    api().mockRejectedValue(new Error('no registry'));
    await useStore.getState()[fetchName]();
    expect(useStore.getState()[loadedKey]).toBe(true);
    expect(useStore.getState()[loadingKey]).toBe(false);
  });
});
