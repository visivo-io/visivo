import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { SAMPLES } from './concepts';

const SAMPLES_ROOT = path.resolve(__dirname, '../../../../visivo/templates/samples');

const loadSample = name =>
  yaml.load(fs.readFileSync(path.join(SAMPLES_ROOT, name, 'project.visivo.yml'), 'utf8'));

describe('onboarding SAMPLES match the bundled sample projects', () => {
  test.each(Object.values(SAMPLES))('$name card states the real source type and chart count', s => {
    const project = loadSample(s.name);
    expect(s.schema).toBe(`${project.sources[0].type} · ${project.charts.length} charts`);
  });

  test('the ev-sales card describes the dimensions its data has', () => {
    const { desc } = SAMPLES['ev-sales'];
    expect(desc).toMatch(/region/i);
    expect(desc).toMatch(/powertrain/i);
    expect(desc).not.toMatch(/\bstate\b|\bmodel\b|\bUS\b/);
  });

  test('the ev-sales dashboard text names the data region, not a country', () => {
    const project = loadSample('ev-sales');
    const markdown = project.dashboards[0].rows[0].items[0].markdown.content;
    expect(markdown).toContain('North America');
    expect(markdown).not.toMatch(/\bUS\b/);
  });
});
