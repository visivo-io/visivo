import {
  clearOnboardingState,
  hasOptedOutOfOnboarding,
  onboardingKey,
  onboardingScopeFor,
  readOnboardingState,
  setOnboardingScope,
  writeOnboardingState,
} from './onboardingState';

afterEach(() => {
  setOnboardingScope(null);
  window.localStorage.clear();
});

test('a local project is scoped by its file, a cloud project by its id', () => {
  expect(onboardingScopeFor({ id: 'id', project_file_path: '/a/project.visivo.yml' })).toBe(
    '/a/project.visivo.yml'
  );
  expect(onboardingScopeFor({ id: 'draft-uuid' })).toBe('draft-uuid');
  expect(onboardingScopeFor(null)).toBeNull();
});

test("one project's opt-out does not reach another project", () => {
  setOnboardingScope('/projects/a');
  writeOnboardingState({ path: 'skipped', completed_at: 'now' });
  expect(hasOptedOutOfOnboarding()).toBe(true);

  setOnboardingScope('/projects/b');
  expect(readOnboardingState()).toBeNull();
  expect(hasOptedOutOfOnboarding()).toBe(false);

  setOnboardingScope('/projects/a');
  expect(hasOptedOutOfOnboarding()).toBe(true);
});

test('clearing removes only the current project', () => {
  setOnboardingScope('a');
  writeOnboardingState({ path: 'sample' });
  setOnboardingScope('b');
  writeOnboardingState({ path: 'data' });
  clearOnboardingState();
  expect(readOnboardingState()).toBeNull();
  setOnboardingScope('a');
  expect(readOnboardingState()).toEqual({ path: 'sample' });
  expect(onboardingKey()).toBe('visivo.onboarding.v1:a');
});

test('only an empty-project start counts as opting out', () => {
  expect(hasOptedOutOfOnboarding({ path: 'skipped' })).toBe(true);
  expect(hasOptedOutOfOnboarding({ checklist_dismissed: true })).toBe(false);
  expect(hasOptedOutOfOnboarding({ path: 'sample', completed_at: 'x' })).toBe(false);
});
