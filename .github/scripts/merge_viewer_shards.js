// Run from viewer/ with NODE_PATH=node_modules.
// Usage: node merge_viewer_shards.js <shards dir> <output dir> <shard count>
// Env: SHARD_RESULT (the matrix result), MIN_VIEWER_TESTS, EXPECTED_SUITES.
const fs = require('fs');
const path = require('path');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const [root, outDir, shardCount] = process.argv.slice(2);
const problems = [];
const totals = { suites: 0, tests: 0, passed: 0, failed: 0, pending: 0 };
const coverage = libCoverage.createCoverageMap({});

if (process.env.SHARD_RESULT !== 'success') {
  problems.push(`viewer-test result is ${process.env.SHARD_RESULT}`);
}

for (let shard = 1; shard <= Number(shardCount); shard += 1) {
  const dir = path.join(root, `viewer-shard-${shard}`);
  const jestPath = path.join(dir, 'viewer/jest.json');
  const coveragePath = path.join(dir, 'coverage-js/coverage-final.json');
  if (!fs.existsSync(jestPath) || !fs.existsSync(coveragePath)) {
    problems.push(`shard ${shard}: artifact is missing`);
    continue;
  }
  const jest = JSON.parse(fs.readFileSync(jestPath));
  if (!jest.success) problems.push(`shard ${shard}: jest reported failure`);
  if (jest.numTotalTests === 0) problems.push(`shard ${shard}: ran no tests`);
  totals.suites += jest.numTotalTestSuites;
  totals.tests += jest.numTotalTests;
  totals.passed += jest.numPassedTests;
  totals.failed += jest.numFailedTests;
  totals.pending += jest.numPendingTests;
  coverage.merge(JSON.parse(fs.readFileSync(coveragePath)));
}

const minTests = Number(process.env.MIN_VIEWER_TESTS);
if (totals.tests < minTests) problems.push(`${totals.tests} tests is below the ${minTests} floor`);
const expectedSuites = Number(process.env.EXPECTED_SUITES);
if (totals.suites !== expectedSuites) {
  problems.push(`${totals.suites} suites ran, jest lists ${expectedSuites}`);
}

fs.mkdirSync(outDir, { recursive: true });
reports
  .create('json-summary')
  .execute(libReport.createContext({ dir: outDir, coverageMap: coverage }));
const summary = JSON.parse(fs.readFileSync(path.join(outDir, 'coverage-summary.json'))).total;

const line = `totals ${JSON.stringify(totals)} lines ${summary.lines.pct}% branches ${summary.branches.pct}%`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);

if (problems.length) {
  for (const problem of problems) console.log(`::error::${problem}`);
  process.exit(1);
}
