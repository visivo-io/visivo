/**
 * workspaceUrl — the workspace view/tab ⇄ URL mapping. Simplified in Explore
 * 2.0 Phase 0 (D1): the URL now resolves to exactly one of two kinds of
 * target — a workspace VIEW (one of the three destinations,
 * `higherLevelViews.js`) or a document TAB.
 *
 * Pins both the default root mount (`/workspace`, Studio) and a host prefix
 * mount (`/:account/:stage/:project/workspace`, the cloud app) so tab
 * navigation stays inside whatever prefix the viewer is mounted under.
 */
import {
  WORKSPACE_BASE,
  workspaceViewUrl,
  workspaceTabUrl,
  workspaceTargetFromUrl,
} from './workspaceUrl';

const params = search => new URLSearchParams(search);

describe('workspaceViewUrl (default root base)', () => {
  test('project → the bare base', () => {
    expect(workspaceViewUrl('project')).toBe(WORKSPACE_BASE);
  });

  test('semantic-layer / explorer → their reserved path segments', () => {
    expect(workspaceViewUrl('semantic-layer')).toBe('/workspace/semantic-layer');
    expect(workspaceViewUrl('explorer')).toBe('/workspace/exploration');
  });

  test('an unknown view falls back to the default (project) view', () => {
    expect(workspaceViewUrl('bogus')).toBe(WORKSPACE_BASE);
  });
});

describe('workspaceViewUrl (host prefix base)', () => {
  const base = '/acme/main/proj/workspace';

  test('every view is prefixed with the mount base', () => {
    expect(workspaceViewUrl('project', base)).toBe(base);
    expect(workspaceViewUrl('semantic-layer', base)).toBe(`${base}/semantic-layer`);
    expect(workspaceViewUrl('explorer', base)).toBe(`${base}/exploration`);
  });
});

describe('workspaceTabUrl (documents)', () => {
  test('dashboard → its dedicated path', () => {
    expect(workspaceTabUrl({ type: 'dashboard', name: 'sales' })).toBe(
      '/workspace/dashboard/sales'
    );
  });

  test('every other document type → ?edit=<type>:<name> (encoded)', () => {
    expect(workspaceTabUrl({ type: 'chart', name: 'revenue' })).toBe(
      '/workspace?edit=chart%3Arevenue'
    );
    expect(workspaceTabUrl({ type: 'insight', name: 'weekly:active' })).toBe(
      '/workspace?edit=insight%3Aweekly%3Aactive'
    );
  });

  test('back-compat: a VIEW-typed payload (legacy `openWorkspaceTab({type:"project"|"semantic-layer",...})` call sites) resolves to its view URL, not ?edit=', () => {
    expect(workspaceTabUrl({ type: 'project', name: 'p' })).toBe(WORKSPACE_BASE);
    expect(workspaceTabUrl({ type: 'semantic-layer', name: 'semantic-layer' })).toBe(
      '/workspace/semantic-layer'
    );
    expect(workspaceTabUrl(null)).toBe(WORKSPACE_BASE);
  });

  test('every tab kind is prefixed with a host mount base', () => {
    const base = '/acme/main/proj/workspace';
    expect(workspaceTabUrl({ type: 'chart', name: 'revenue' }, base)).toBe(
      `${base}?edit=chart%3Arevenue`
    );
    expect(workspaceTabUrl({ type: 'dashboard', name: 'sales' }, base)).toBe(
      `${base}/dashboard/sales`
    );
  });
});

describe('workspaceTargetFromUrl', () => {
  test('the bare base with no params resolves to the default (project) VIEW', () => {
    expect(workspaceTargetFromUrl('/workspace', params(''))).toEqual({
      kind: 'view',
      view: 'project',
    });
  });

  test('the reserved view path segments resolve to their VIEW target', () => {
    expect(workspaceTargetFromUrl('/workspace/semantic-layer', params(''))).toEqual({
      kind: 'view',
      view: 'semantic-layer',
    });
    expect(workspaceTargetFromUrl('/workspace/exploration', params(''))).toEqual({
      kind: 'view',
      view: 'explorer',
    });
  });

  test('a dashboard path resolves to a TAB target', () => {
    expect(workspaceTargetFromUrl('/workspace/dashboard/sales', params(''))).toEqual({
      kind: 'tab',
      tab: { type: 'dashboard', name: 'sales' },
    });
  });

  test('?edit=<type>:<name> resolves to a TAB target', () => {
    expect(workspaceTargetFromUrl('/workspace', params('?edit=chart:revenue'))).toEqual({
      kind: 'tab',
      tab: { type: 'chart', name: 'revenue' },
    });
  });

  test('every shape resolves correctly under a host prefix base', () => {
    const base = '/acme/main/proj/workspace';
    expect(workspaceTargetFromUrl(base, params(''), base)).toEqual({
      kind: 'view',
      view: 'project',
    });
    expect(workspaceTargetFromUrl(`${base}/semantic-layer`, params(''), base)).toEqual({
      kind: 'view',
      view: 'semantic-layer',
    });
    expect(workspaceTargetFromUrl(`${base}/dashboard/sales`, params(''), base)).toEqual({
      kind: 'tab',
      tab: { type: 'dashboard', name: 'sales' },
    });
    expect(
      workspaceTargetFromUrl(base, params('?edit=chart:revenue'), base)
    ).toEqual({ kind: 'tab', tab: { type: 'chart', name: 'revenue' } });
    // A bare dashboard path WITHOUT the prefix must not match under a prefixed base.
    expect(workspaceTargetFromUrl('/workspace/dashboard/sales', params(''), base)).toEqual({
      kind: 'view',
      view: 'project',
    });
  });

  test('round-trips document tabs through workspaceTabUrl', () => {
    const tab = { type: 'insight', name: 'weekly:active' };
    const url = workspaceTabUrl(tab);
    const [pathname, search] = url.split('?');
    expect(
      workspaceTargetFromUrl(pathname, params(search ? `?${search}` : ''))
    ).toEqual({ kind: 'tab', tab });
  });

  test('round-trips every view through workspaceViewUrl', () => {
    ['project', 'semantic-layer', 'explorer'].forEach(view => {
      const url = workspaceViewUrl(view);
      expect(workspaceTargetFromUrl(url, params(''))).toEqual({ kind: 'view', view });
    });
  });
});
