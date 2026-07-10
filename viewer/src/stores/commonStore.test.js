/**
 * Tests for the URL-param-driven onboarding routing in commonStore.
 *
 * The store's `isOnboardingRequested` flag is derived at module init from
 * (a) the `onboarding=1` URL param and (b) whether onboarding has already
 * been completed (the onboardingState localStorage contract). Because the
 * flag is captured when the store module is first imported, each test resets
 * globals and re-imports the store via jest.isolateModules.
 */

import createCommonSlice from './commonStore';
import { fetchProjectBlob } from '../api/project';
import { fetchProjectFilePath } from '../api/projectFilePath';
import { isObjectSchemaLoaded, resetProjectSchemaCache } from '../schemas/projectSchema';
import {
  preloadValidationSchema,
  validateRecordConfigSync,
  clearValidationCache,
} from '../components/views/workspace/validateAgainstSchema';

jest.mock('../api/project', () => ({ fetchProjectBlob: jest.fn() }));
jest.mock('../api/projectFilePath', () => ({ fetchProjectFilePath: jest.fn() }));
// Keep the schema-identity tests fast: swap the multi-MB bundled snapshot for a
// tiny $defs fixture (the loader/validator contract is identical).
jest.mock('../schemas/visivo_project_schema.json', () => ({
  __esModule: true,
  default: {
    $defs: {
      Dimension: {
        type: 'object',
        required: ['expression'],
        properties: { expression: { type: 'string' } },
      },
    },
  },
}));

// Mirrors the KEY constant in components/onboarding/onboardingState.js
const ONBOARDING_STATE_KEY = 'visivo.onboarding.v1';

const setLocation = (search = '', pathname = '/') => {
  delete window.location;
  window.location = {
    href: `http://localhost${pathname}${search}`,
    pathname,
    search,
    hash: '',
  };
};

const loadStore = () => {
  let useStore;
  jest.isolateModules(() => {
    useStore = require('./store').default;
  });
  return useStore;
};

describe('commonStore - onboarding URL routing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setLocation('', '/');
  });

  test('isOnboardingRequested true when ?onboarding=1 and onboarding not completed', () => {
    setLocation('?onboarding=1', '/');

    expect(loadStore().getState().isOnboardingRequested).toBe(true);
  });

  test('isOnboardingRequested false when onboarding already completed', () => {
    setLocation('?onboarding=1', '/');
    window.localStorage.setItem(
      ONBOARDING_STATE_KEY,
      JSON.stringify({ completed_at: new Date().toISOString() })
    );

    expect(loadStore().getState().isOnboardingRequested).toBe(false);
  });

  test('isOnboardingRequested false when URL has no onboarding param', () => {
    setLocation('', '/');

    expect(loadStore().getState().isOnboardingRequested).toBe(false);
  });
});

/**
 * Slice-level tests: drive createCommonSlice with a minimal zustand-style
 * set/get harness so actions can be asserted behaviorally without pulling
 * in every other store slice.
 */
const createHarness = () => {
  let state = {};
  const set = partial => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
  };
  const get = () => state;
  state = createCommonSlice(set, get);
  return { getState: () => state };
};

describe('commonStore slice actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    setLocation('', '/');
  });

  describe('setScrollPosition', () => {
    test('records a scroll position per dashboard and merges across calls', () => {
      const store = createHarness();

      store.getState().setScrollPosition('dash-a', 120);
      store.getState().setScrollPosition('dash-b', 300);
      store.getState().setScrollPosition('dash-a', 450);

      expect(store.getState().scrollPositions).toEqual({ 'dash-a': 450, 'dash-b': 300 });
    });
  });

  describe('setProject / isNewProject heuristic', () => {
    test('flags a Quickstart project with no dashboards as new', () => {
      const store = createHarness();

      store.getState().setProject({
        project_json: { name: 'Quickstart Visivo', dashboards: [] },
      });

      expect(store.getState().project.project_json.name).toBe('Quickstart Visivo');
      expect(store.getState().isNewProject).toBe(true);
    });

    test('a Quickstart project WITH dashboards is not new', () => {
      const store = createHarness();

      store.getState().setProject({
        project_json: { name: 'Quickstart Visivo', dashboards: [{ name: 'd1' }] },
      });

      expect(store.getState().isNewProject).toBe(false);
    });

    test('a differently-named project is not new even with no dashboards', () => {
      const store = createHarness();

      store.getState().setProject({ project_json: { name: 'my-project', dashboards: [] } });

      expect(store.getState().isNewProject).toBe(false);
    });

    test('handles a project without project_json without throwing', () => {
      const store = createHarness();

      store.getState().setProject({ id: 'p1' });

      expect(store.getState().isNewProject).toBe(false);
    });
  });

  describe('setProjectFilePath', () => {
    test('stores the path', () => {
      const store = createHarness();

      store.getState().setProjectFilePath('/home/user/project.visivo.yml');

      expect(store.getState().projectFilePath).toBe('/home/user/project.visivo.yml');
    });
  });

  describe('fetchProject', () => {
    test('loads the bulk project blob and evaluates isNewProject', async () => {
      fetchProjectBlob.mockResolvedValue({
        project_json: { name: 'Quickstart Visivo', dashboards: [] },
      });
      const store = createHarness();

      await store.getState().fetchProject();

      expect(fetchProjectBlob).toHaveBeenCalledTimes(1);
      expect(store.getState().project.project_json.name).toBe('Quickstart Visivo');
      expect(store.getState().isNewProject).toBe(true);
    });

    test('an existing project loads as not-new', async () => {
      fetchProjectBlob.mockResolvedValue({
        project_json: { name: 'prod-analytics', dashboards: [{ name: 'kpis' }] },
      });
      const store = createHarness();

      await store.getState().fetchProject();

      expect(store.getState().isNewProject).toBe(false);
    });
  });

  describe('fetchProjectFilePath', () => {
    test('loads and stores the project file path', async () => {
      fetchProjectFilePath.mockResolvedValue('/repo/project.visivo.yml');
      const store = createHarness();

      await store.getState().fetchProjectFilePath();

      expect(store.getState().projectFilePath).toBe('/repo/project.visivo.yml');
    });
  });

  // ── VIS-1025: project-keyed schema caches ──────────────────────────────────
  // projectSchema's module-level caches (and validateAgainstSchema's compiled
  // validators on top) carry no project identity. The store layer is the seam
  // where project switches land — commonStore compares the previous project.id
  // on EVERY project write (setProject, fetchProject — and transitively the
  // commitStore project_changed soft refresh, which routes through
  // fetchProject) and drops BOTH cache layers only when the id CHANGES.
  describe('project-keyed schema caches (VIS-1025)', () => {
    const warm = async () => {
      await preloadValidationSchema();
      expect(validateRecordConfigSync('dimension', { expression: 'x' })).toEqual(
        expect.objectContaining({ valid: true })
      );
      expect(isObjectSchemaLoaded()).toBe(true);
    };

    beforeEach(() => {
      clearValidationCache();
      resetProjectSchemaCache();
    });
    afterEach(() => {
      clearValidationCache();
      resetProjectSchemaCache();
    });

    test('switching to a DIFFERENT project id clears the schema + validator caches', async () => {
      const store = createHarness();
      store.getState().setProject({ id: 'proj-1' });
      await warm();

      store.getState().setProject({ id: 'proj-2' });

      // Cold until re-warmed: the sync gate yields null (defer to async),
      // and the root schema is no longer loaded.
      expect(validateRecordConfigSync('dimension', { expression: 'x' })).toBeNull();
      expect(isObjectSchemaLoaded()).toBe(false);

      // Re-warming binds cleanly against the new identity.
      await preloadValidationSchema();
      expect(validateRecordConfigSync('dimension', { expression: 'x' })).toEqual(
        expect.objectContaining({ valid: true })
      );
    });

    test('a same-id refetch keeps both cache layers warm', async () => {
      const store = createHarness();
      store.getState().setProject({ id: 'proj-1' });
      await warm();

      store.getState().setProject({ id: 'proj-1', refetched_at: 'now' });

      expect(validateRecordConfigSync('dimension', { expression: 'x' })).toEqual(
        expect.objectContaining({ valid: true })
      );
      expect(isObjectSchemaLoaded()).toBe(true);
    });

    test('the FIRST project landing does not blow a pre-warmed cache', async () => {
      const store = createHarness();
      await warm(); // preloaded before any project id is known

      store.getState().setProject({ id: 'proj-1' });

      expect(validateRecordConfigSync('dimension', { expression: 'x' })).toEqual(
        expect.objectContaining({ valid: true })
      );
      expect(isObjectSchemaLoaded()).toBe(true);
    });

    test('a project write WITHOUT an id (local blob) never clears', async () => {
      const store = createHarness();
      store.getState().setProject({ id: 'proj-1' });
      await warm();

      store.getState().setProject({ project_json: { name: 'local', dashboards: [] } });

      expect(isObjectSchemaLoaded()).toBe(true);
    });

    test('fetchProject routes through the same identity check (id change clears, same id keeps)', async () => {
      const store = createHarness();
      store.getState().setProject({ id: 'proj-1' });
      await warm();

      // Same-id refetch (the project_changed soft-refresh shape) — intact.
      fetchProjectBlob.mockResolvedValue({ id: 'proj-1', project_json: { name: 'p' } });
      await store.getState().fetchProject();
      expect(isObjectSchemaLoaded()).toBe(true);
      expect(validateRecordConfigSync('dimension', { expression: 'x' })).toEqual(
        expect.objectContaining({ valid: true })
      );

      // Id flip (e.g. the active project became a different one) — cleared.
      fetchProjectBlob.mockResolvedValue({ id: 'proj-2', project_json: { name: 'p2' } });
      await store.getState().fetchProject();
      expect(validateRecordConfigSync('dimension', { expression: 'x' })).toBeNull();
      expect(isObjectSchemaLoaded()).toBe(false);
    });
  });

  describe('initial state', () => {
    test('starts with null project, undefined isNewProject, empty scroll positions', () => {
      const store = createHarness();

      expect(store.getState().project).toBeNull();
      expect(store.getState().projectFilePath).toBeNull();
      expect(store.getState().isNewProject).toBeUndefined();
      expect(store.getState().scrollPositions).toEqual({});
    });

    test('isOnboardingRequested is false when reading the URL throws', () => {
      // A location whose `search` getter throws exercises the guard that
      // keeps onboarding routing from ever breaking store creation.
      delete window.location;
      window.location = {};
      Object.defineProperty(window.location, 'search', {
        get() {
          throw new Error('no location');
        },
      });

      const store = createHarness();

      expect(store.getState().isOnboardingRequested).toBe(false);
    });
  });
});
