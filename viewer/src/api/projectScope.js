/**
 * Project scoping for API URLs.
 *
 * Deliberately NOT in `api/utils.js`: that module is the fetch layer and is
 * mocked wholesale (`jest.mock('./utils', () => ({ apiFetch: jest.fn() }))`) by
 * a dozen test files, so anything added there is undefined in every one of
 * them. This is a pure string function with no dependencies — nothing needs to
 * mock it.
 */
/**
 * Append `?project_id=` to a URL, if there is one to append.
 *
 * Studio serves one project per server and ignores the param; cloud serves
 * many and REQUIRES it — its project-scoped endpoints 400 without it. The
 * viewer is the same code in both, so every call to a project-scoped endpoint
 * has to carry it when it's known and omit it when it isn't.
 *
 * A plain function over the existing convention (`dimensions.js`, `sources.js`,
 * `models.js` all hand-roll this line), not a new mechanism: the caller still
 * decides and still passes the id. It exists because hand-rolling it once per
 * function is how four modules ended up never doing it at all, and because the
 * ones that need it here already carry other query params, so the `?`-vs-`&`
 * is a real thing to get wrong.
 */
export const withProjectId = (url, projectId) => {
  if (!projectId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}project_id=${encodeURIComponent(projectId)}`;
};
