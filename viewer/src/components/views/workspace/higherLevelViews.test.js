/**
 * higherLevelViews — the workspace's three DESTINATIONS registry (D1,
 * Explore 2.0 Phase 0).
 */
import {
  HIGHER_LEVEL_VIEWS,
  DEFAULT_WORKSPACE_VIEW,
  getViewDescriptor,
  isWorkspaceView,
  viewForDocumentType,
} from './higherLevelViews';
import { getTypeByValue } from '../common/objectTypeConfigs';

describe('HIGHER_LEVEL_VIEWS', () => {
  test('has exactly three destinations, in the fixed UX order (Project, Semantic Layer, Explorer)', () => {
    expect(HIGHER_LEVEL_VIEWS.map(v => v.key)).toEqual(['project', 'semantic-layer', 'explorer']);
  });

  test('every descriptor has a HomePane component, a scope, and a urlPath', () => {
    HIGHER_LEVEL_VIEWS.forEach(view => {
      expect(view.HomePane).toBeTruthy();
      expect(typeof view.label).toBe('string');
      expect(typeof view.scope).toBe('string');
      expect(typeof view.urlPath).toBe('string');
    });
  });

  test('only the project view owns the bare-root path (empty urlPath)', () => {
    const bareRoot = HIGHER_LEVEL_VIEWS.filter(v => v.urlPath === '');
    expect(bareRoot).toHaveLength(1);
    expect(bareRoot[0].key).toBe('project');
  });

  test('every view key resolves a real objectTypeConfigs entry (icon/color source — B1 fix)', () => {
    HIGHER_LEVEL_VIEWS.forEach(view => {
      const typeDef = getTypeByValue(view.key);
      expect(typeDef).toBeTruthy();
      expect(typeDef.icon).toBeTruthy();
      expect(typeDef.colors).toBeTruthy();
      // Destinations are chrome, not creatable data objects.
      expect(typeDef.enabled).toBe(false);
    });
  });

  test('every view has a UNIQUE scope (B3 fix — semantic-layer no longer shares `item`)', () => {
    const scopes = HIGHER_LEVEL_VIEWS.map(v => v.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(scopes).not.toContain('item');
  });
});

describe('DEFAULT_WORKSPACE_VIEW', () => {
  test('is "project" — a fresh session opens on the Project home', () => {
    expect(DEFAULT_WORKSPACE_VIEW).toBe('project');
  });
});

describe('getViewDescriptor', () => {
  test('resolves a known view key', () => {
    expect(getViewDescriptor('semantic-layer').key).toBe('semantic-layer');
  });

  test('returns null for an unknown key', () => {
    expect(getViewDescriptor('bogus')).toBeNull();
    expect(getViewDescriptor(undefined)).toBeNull();
  });
});

describe('isWorkspaceView', () => {
  test('true for the three destinations, false for document types', () => {
    expect(isWorkspaceView('project')).toBe(true);
    expect(isWorkspaceView('semantic-layer')).toBe(true);
    expect(isWorkspaceView('explorer')).toBe(true);
    expect(isWorkspaceView('chart')).toBe(false);
    expect(isWorkspaceView('dashboard')).toBe(false);
    expect(isWorkspaceView(undefined)).toBe(false);
  });
});

describe('viewForDocumentType (the 01-ux-spec.md §1 deep-link rule)', () => {
  test('metric / dimension / relation → semantic-layer', () => {
    expect(viewForDocumentType('metric')).toBe('semantic-layer');
    expect(viewForDocumentType('dimension')).toBe('semantic-layer');
    expect(viewForDocumentType('relation')).toBe('semantic-layer');
  });

  test('exploration → explorer (Phase 2 document type, mapped now)', () => {
    expect(viewForDocumentType('exploration')).toBe('explorer');
  });

  test('every other document type → project', () => {
    ['chart', 'table', 'markdown', 'input', 'insight', 'dashboard', 'source', 'model'].forEach(
      type => expect(viewForDocumentType(type)).toBe('project')
    );
  });

  test('an unknown type defaults to project', () => {
    expect(viewForDocumentType('bogus')).toBe('project');
    expect(viewForDocumentType(undefined)).toBe('project');
  });
});
