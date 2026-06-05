/* Jest stub for posthogEnv.js.
 *
 * Under jest/jsdom there is no Vite env injection and `import.meta` cannot be
 * parsed, so the real module is mapped to this stub (see the `moduleNameMapper`
 * entry in package.json). It always reports "no PostHog config", which keeps
 * posthog from initializing and makes fireEvent a pure buffer push in tests.
 */

export function getPosthogConfig() {
  return null;
}
