/* eslint-disable no-template-curly-in-string -- literal Visivo `${ref(...)}` strings are the data under test, not template-literal mistakes */
import {
  INTERACTION_HELP,
  INTERACTION_TYPES,
  INTERACTION_TYPE_OPTIONS,
  interactionExampleHint,
  interactionHelpText,
} from './interactionHelp';
import projectSchema from './visivo_project_schema.json';
import { canonicalizeQueryString } from '../utils/expressionCodec';

const INTERACTION_DEF = projectSchema.$defs.InsightInteraction;

/**
 * Pull the three `- <field>: ?{ ... }` lines out of the InsightInteraction
 * docstring's YAML example block. These are the examples the docs site
 * publishes, so they are the examples the UI should show.
 */
function examplesFromDocstring(description) {
  const found = {};
  for (const line of description.split('\n')) {
    const match = line.match(/^\s*-\s+(filter|split|sort):\s*(.+?)\s*$/);
    if (match) found[match[1]] = match[2];
  }
  return found;
}

describe('interactionHelp is derived from the model, not hand-written', () => {
  it('covers exactly the fields InsightInteraction declares', () => {
    expect(INTERACTION_TYPES).toEqual(Object.keys(INTERACTION_DEF.properties));
  });

  it.each(INTERACTION_TYPES)(
    "%s's description is byte-identical to the model's Field(description=…)",
    type => {
      expect(INTERACTION_HELP[type].description).toBe(
        INTERACTION_DEF.properties[type].description
      );
    }
  );

  it.each(INTERACTION_TYPES)(
    "%s's yamlExample is byte-identical to the model docstring's example",
    type => {
      const fromDocstring = examplesFromDocstring(INTERACTION_DEF.description);
      expect(INTERACTION_HELP[type].yamlExample).toBe(fromDocstring[type]);
    }
  );

  it.each(INTERACTION_TYPES)("%s's example is the yamlExample's body, unwrapped", type => {
    const { example, yamlExample } = INTERACTION_HELP[type];
    // The editors wrap what the user types, so the hint must show the body.
    // Re-wrapping the body must reproduce the documented YAML value.
    expect(canonicalizeQueryString(example)).toBe(canonicalizeQueryString(yamlExample));
    expect(example).not.toContain('?{');
  });
});

describe('the advertised examples are values this grammar accepts', () => {
  // A JS mirror of visivo/models/base/query_string.py's validate_and_create.
  const pydanticWouldAccept = value =>
    value.startsWith('?{') && (value.endsWith('}') || /\}(\[[^\]]+\])\s*$/.test(value));

  it.each(INTERACTION_TYPES)('%s: the example survives the save path and validates', type => {
    const stored = canonicalizeQueryString(INTERACTION_HELP[type].example);
    expect(pydanticWouldAccept(stored)).toBe(true);
  });

  it.each(INTERACTION_TYPES)('%s: the example references a model, not a loose column', type => {
    // C15's second half. `date DESC` passed nothing: the parser rejected it
    // unwrapped, and `?{date DESC}` reaches the binder as an unresolvable bare
    // identifier. Every example must carry a real `${ref(...)}`.
    expect(INTERACTION_HELP[type].example).toMatch(/\$\{\s*ref\(/);
  });

  it('never teaches the "date DESC" form again', () => {
    const everyString = JSON.stringify(INTERACTION_HELP) + JSON.stringify(INTERACTION_TYPE_OPTIONS);
    expect(everyString).not.toMatch(/\bdate\s+DESC\b/i);
  });

  it.each(INTERACTION_TYPES)('%s: the rendered hint carries no markdown backticks', type => {
    // The model descriptions are markdown (they publish to the docs site); the
    // helper line is plain text in a plain <p>, so backticks would render.
    expect(interactionHelpText(type)).not.toContain('`');
  });

  it('only offers the ASC/DESC modifiers the model documents', () => {
    // NULLS FIRST/LAST leak through the ORDER BY strippers today, so the help
    // must not advertise them until that is fixed.
    expect(JSON.stringify(INTERACTION_HELP)).not.toMatch(/NULLS/i);
    expect(INTERACTION_DEF.properties.sort.description).toMatch(/`ASC` or `DESC`/);
  });
});

describe('interactionHelpText', () => {
  it('joins the model description to a working example', () => {
    expect(interactionHelpText('sort')).toBe(
      'Column or expression to sort rows by; append ASC or DESC to control direction. ' +
        'For example: ${ref(orders).month} ASC'
    );
  });

  it('puts a surface-specific clause between the description and the example', () => {
    // The example comes LAST so nothing runs into it — a hint that ended
    // "…${ref(orders).month} ASC Type @ to insert references" reads as if the
    // words after the expression were part of it.
    expect(interactionHelpText('sort', 'Type @ to insert references.')).toBe(
      'Column or expression to sort rows by; append ASC or DESC to control direction. ' +
        'Type @ to insert references. For example: ${ref(orders).month} ASC'
    );
  });

  it('returns an empty string for an unknown type rather than throwing', () => {
    expect(interactionHelpText('nope')).toBe('');
    expect(interactionHelpText(undefined)).toBe('');
    expect(interactionHelpText('nope', 'extra')).toBe('');
  });
});

describe('interactionExampleHint', () => {
  it.each(INTERACTION_TYPES)('%s: shows the same example, without the sentence', type => {
    const hint = interactionExampleHint(type);
    expect(hint).toBe(`e.g. ${INTERACTION_HELP[type].example}`);
    // The Build rail's rows are one line tall; a wrapping paragraph there
    // would triple every row's height.
    expect(hint.length).toBeLessThan(60);
  });

  it('returns an empty string for an unknown type rather than throwing', () => {
    expect(interactionExampleHint('nope')).toBe('');
    expect(interactionExampleHint(undefined)).toBe('');
  });
});

describe('INTERACTION_TYPE_OPTIONS', () => {
  it('is the Select-ready shape both editors need', () => {
    expect(INTERACTION_TYPE_OPTIONS).toEqual([
      { value: 'filter', label: 'Filter', helperText: interactionHelpText('filter') },
      { value: 'split', label: 'Split', helperText: interactionHelpText('split') },
      { value: 'sort', label: 'Sort', helperText: interactionHelpText('sort') },
    ]);
  });
});
