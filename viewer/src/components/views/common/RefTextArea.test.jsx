/**
 * RefTextArea tests.
 *
 * Pins two regressions:
 *  - brackets in pasted content must be preserved by default — RefTextArea is
 *    the only editor for free-form SQL fields (input options queries, metric /
 *    dimension expressions, pivot values), where `arr[1]` / `json_col['key']`
 *    are legitimate. Stripping is opt-in via `restrictBrackets` for the
 *    SchemaEditor chip-body editor (slices are authored via SliceBadge).
 *  - the input-accessor dropdown must update the CLICKED pill, not the first
 *    occurrence of the same ref expression.
 */
/* eslint-disable testing-library/no-node-access --
 * RefTextArea is a contentEditable pill editor. These tests must address raw
 * text nodes and pill elements to place DOM carets/selections (Range API),
 * which Testing Library queries cannot express. */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import RefTextArea from './RefTextArea';
import useStore from '../../../stores/store';

// Build '${ref(name)}' / '${ref(name).prop}' without tripping
// no-template-curly-in-string on every literal.
const R = (name, prop) => '${ref(' + name + ')' + (prop ? '.' + prop : '') + '}';

// jsdom doesn't implement Range.getBoundingClientRect, which the @ mention
// dropdown uses to anchor its portal.
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

beforeEach(() => {
  act(() => {
    useStore.setState({
      sources: [],
      models: [],
      dimensions: [],
      metrics: [],
      relations: [],
      inputs: [],
      explorerModelStates: {},
    });
  });
});

// Place the caret at the end of the editable so handlePaste has a range.
const placeCursorAtEnd = el => {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

// Place a collapsed caret at (node, offset).
const setCursor = (node, offset) => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
};

// Replace the editable's content with `text`, put the caret at `offset`
// (defaults to the end), and fire an input event — approximates typing.
const typeText = (editable, text, offset = text.length) => {
  editable.textContent = text;
  setCursor(editable.firstChild, offset);
  fireEvent.input(editable);
};

const paste = (el, text) => {
  fireEvent.paste(el, { clipboardData: { getData: () => text } });
};

describe('RefTextArea — bracket handling', () => {
  test('pasted content keeps [ and ] by default (free-form SQL)', () => {
    const onChange = jest.fn();
    render(<RefTextArea value="" onChange={onChange} allowedTypes={['model']} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    placeCursorAtEnd(editable);

    paste(editable, "select arr[1], json_col['key'] from t");

    expect(onChange).toHaveBeenCalledWith("select arr[1], json_col['key'] from t");
  });

  test('restrictBrackets strips [ and ] from pasted content (chip-body mode)', () => {
    const onChange = jest.fn();
    render(<RefTextArea value="" onChange={onChange} allowedTypes={['model']} restrictBrackets />);
    const editable = screen.getByTestId('ref-textarea-editable');
    placeCursorAtEnd(editable);

    paste(editable, 'prop[0]');

    expect(onChange).toHaveBeenCalledWith('prop0');
  });
});

describe('RefTextArea — accessor dropdown', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        inputs: [{ name: 'sel', config: { type: 'multi-select' } }],
      });
    });
  });

  test('updates the CLICKED pill, not the first matching occurrence', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea
        // eslint-disable-next-line no-template-curly-in-string
        value={'a ${ref(sel).values} b ${ref(sel).values} c'}
        onChange={onChange}
        allowedTypes={['input']}
      />
    );

    // Two identical pills — open the accessor dropdown on the SECOND one.
    const accessors = screen.getAllByTestId('accessor-sel');
    expect(accessors).toHaveLength(2);
    fireEvent.click(accessors[1]);

    fireEvent.click(screen.getByTestId('accessor-option-first'));

    expect(onChange).toHaveBeenCalledWith(
      // eslint-disable-next-line no-template-curly-in-string
      'a ${ref(sel).values} b ${ref(sel).first} c'
    );
  });

  test('a single-accessor input pill is not clickable', () => {
    act(() => {
      useStore.setState({ inputs: [{ name: 'single_pick', config: { type: 'select' } }] });
    });
    render(
      <RefTextArea
        value={R('single_pick', 'value')}
        onChange={jest.fn()}
        allowedTypes={['input']}
      />
    );
    // Only one accessor exists (.value), so there is no accessor affordance.
    expect(screen.queryByTestId('accessor-single_pick')).not.toBeInTheDocument();
  });

  test('lists every multi-select accessor and toggles closed on re-click', () => {
    render(
      <RefTextArea value={R('sel', 'values')} onChange={jest.fn()} allowedTypes={['input']} />
    );

    fireEvent.click(screen.getByTestId('accessor-sel'));
    expect(screen.getByTestId('accessor-dropdown-sel')).toBeInTheDocument();
    ['values', 'first', 'last', 'min', 'max'].forEach(acc => {
      expect(screen.getByTestId(`accessor-option-${acc}`)).toBeInTheDocument();
    });

    // Clicking the accessor again closes the dropdown.
    fireEvent.click(screen.getByTestId('accessor-sel'));
    expect(screen.queryByTestId('accessor-dropdown-sel')).not.toBeInTheDocument();
  });

  test('selecting the current accessor closes without emitting a change', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea value={R('sel', 'values')} onChange={onChange} allowedTypes={['input']} />
    );

    fireEvent.click(screen.getByTestId('accessor-sel'));
    fireEvent.click(screen.getByTestId('accessor-option-values'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('accessor-dropdown-sel')).not.toBeInTheDocument();
  });

  test('mousedown outside closes the accessor dropdown', () => {
    render(
      <RefTextArea value={R('sel', 'values')} onChange={jest.fn()} allowedTypes={['input']} />
    );

    fireEvent.click(screen.getByTestId('accessor-sel'));
    expect(screen.getByTestId('accessor-dropdown-sel')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('accessor-dropdown-sel')).not.toBeInTheDocument();
  });
});

describe('RefTextArea — @ mention dropdown', () => {
  const seedStore = () => {
    act(() => {
      useStore.setState({
        sources: [{ name: 'warehouse', config: {} }],
        models: [
          { name: 'orders', config: {} },
          { name: 'customers', config: {} },
        ],
        explorerModelStates: {
          orders: { queryResult: { columns: ['amount', 'region'] } },
        },
        dimensions: [{ name: 'region_dim', config: { description: 'Region dimension' } }],
        metrics: [{ name: 'revenue', config: {} }],
        relations: [{ name: 'orders_customers', config: {} }],
        inputs: [
          { name: 'picker', config: { type: 'multi-select' } },
          { name: 'single_pick', config: { type: 'select' } },
        ],
      });
    });
  };

  beforeEach(seedStore);

  const renderAllTypes = () => {
    const onChange = jest.fn();
    render(
      <RefTextArea
        value=""
        onChange={onChange}
        allowedTypes={['source', 'model', 'dimension', 'metric', 'relation', 'input']}
      />
    );
    return { onChange, editable: screen.getByTestId('ref-textarea-editable') };
  };

  test('typing @ opens a dropdown grouped by type with every allowed object', () => {
    const { editable } = renderAllTypes();
    typeText(editable, '@');

    expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();

    // Sources listed by name
    expect(screen.getByTestId('mention-item-warehouse')).toBeInTheDocument();
    // Models with known columns expand to model.column entries
    expect(screen.getByTestId('mention-item-orders.amount')).toBeInTheDocument();
    expect(screen.getByTestId('mention-item-orders.region')).toBeInTheDocument();
    // Models without columns fall back to the bare model entry
    expect(screen.getByTestId('mention-item-customers')).toBeInTheDocument();
    // Dimensions, metrics, relations
    expect(screen.getByTestId('mention-item-region_dim')).toBeInTheDocument();
    expect(screen.getByTestId('mention-item-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('mention-item-orders_customers')).toBeInTheDocument();
    // Inputs use their default accessor: multi-select → .values, select → .value
    expect(screen.getByTestId('mention-item-picker.values')).toBeInTheDocument();
    expect(screen.getByTestId('mention-item-single_pick.value')).toBeInTheDocument();

    // Group headers use the type labels; descriptions render under items
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('Region dimension')).toBeInTheDocument();
  });

  test('the query after @ filters the list', () => {
    const { editable } = renderAllTypes();
    typeText(editable, '@rev');

    expect(screen.getByTestId('mention-item-revenue')).toBeInTheDocument();
    expect(screen.queryByTestId('mention-item-warehouse')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mention-item-region_dim')).not.toBeInTheDocument();
  });

  test('shows an empty state when nothing matches', () => {
    const { editable } = renderAllTypes();
    typeText(editable, '@zzzz');
    expect(screen.getByText('No matching objects')).toBeInTheDocument();
  });

  test('a space between @ and the caret suppresses the dropdown', () => {
    const { onChange, editable } = renderAllTypes();
    typeText(editable, '@ x');
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith('@ x');
  });

  test('the dropdown closes when typing removes the @', () => {
    const { editable } = renderAllTypes();
    typeText(editable, '@');
    expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();

    typeText(editable, 'plain');
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument();
  });

  test('Escape closes the dropdown without inserting', () => {
    const { onChange, editable } = renderAllTypes();
    typeText(editable, '@');
    fireEvent.keyDown(editable, { key: 'Escape' });

    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining('ref('));
  });

  test('clicking an item inserts its pill and serializes the ref', () => {
    const { onChange, editable } = renderAllTypes();
    typeText(editable, '@');

    fireEvent.click(screen.getByTestId('mention-item-revenue'));

    expect(onChange).toHaveBeenLastCalledWith(R('revenue'));
    expect(editable.querySelector('[data-ref-name="revenue"]')).not.toBeNull();
    expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument();
  });

  test('clicking a model.column item inserts a pill with the column accessor', () => {
    const { onChange, editable } = renderAllTypes();
    typeText(editable, '@');

    fireEvent.click(screen.getByTestId('mention-item-orders.amount'));
    expect(onChange).toHaveBeenLastCalledWith(R('orders', 'amount'));
  });

  test('ArrowDown + Enter inserts the highlighted item', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea value="" onChange={onChange} allowedTypes={['dimension', 'metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');
    typeText(editable, '@');

    // Flat list order: region_dim (dimension group), revenue (metric group)
    fireEvent.keyDown(editable, { key: 'ArrowDown' });
    fireEvent.keyDown(editable, { key: 'Enter' });

    expect(onChange).toHaveBeenLastCalledWith(R('revenue'));
  });

  test('ArrowUp moves back up and clamps at the first item', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea value="" onChange={onChange} allowedTypes={['dimension', 'metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');
    typeText(editable, '@');

    fireEvent.keyDown(editable, { key: 'ArrowDown' });
    fireEvent.keyDown(editable, { key: 'ArrowDown' }); // clamps at last (index 1)
    fireEvent.keyDown(editable, { key: 'ArrowUp' });
    fireEvent.keyDown(editable, { key: 'ArrowUp' }); // clamps at 0
    fireEvent.keyDown(editable, { key: 'Tab' }); // Tab also inserts

    expect(onChange).toHaveBeenLastCalledWith(R('region_dim'));
  });

  test('inserting mid-expression keeps surrounding text', () => {
    const { onChange, editable } = renderAllTypes();
    typeText(editable, 'sum(@rev');

    fireEvent.keyDown(editable, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('sum(' + R('revenue'));
  });

  test('inserting before trailing text keeps the tail', () => {
    const { onChange, editable } = renderAllTypes();
    // Caret right after '@rev', before ' tail'
    typeText(editable, '@rev tail', 4);

    fireEvent.keyDown(editable, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(R('revenue') + ' tail');
  });

  test('blurring closes the dropdown after the click grace period', () => {
    jest.useFakeTimers();
    try {
      const { editable } = renderAllTypes();
      typeText(editable, '@');
      expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();

      fireEvent.blur(editable);
      act(() => {
        jest.advanceTimersByTime(250);
      });
      expect(screen.queryByTestId('mention-dropdown')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('RefTextArea — pill editing with backspace', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({ metrics: [{ name: 'revenue', config: {} }] });
    });
  });

  test('backspace at the start of the text after a pill deletes the pill', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea value={R('revenue') + ' plus'} onChange={onChange} allowedTypes={['metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');
    // DOM: [zws text][pill][' plus']
    setCursor(editable.childNodes[2], 0);

    fireEvent.keyDown(editable, { key: 'Backspace' });

    expect(editable.querySelectorAll('[data-ref-name]')).toHaveLength(0);
    expect(onChange).toHaveBeenCalledWith(' plus');
  });

  test('backspace at a container offset just after a pill deletes the pill', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea value={R('revenue') + ' plus'} onChange={onChange} allowedTypes={['metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');
    // Offset 2 in the container → previous child is the pill
    setCursor(editable, 2);

    fireEvent.keyDown(editable, { key: 'Backspace' });

    expect(editable.querySelectorAll('[data-ref-name]')).toHaveLength(0);
    expect(onChange).toHaveBeenCalledWith(' plus');
  });

  test('backspace in the middle of text leaves pills alone', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea value={R('revenue') + ' plus'} onChange={onChange} allowedTypes={['metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');
    setCursor(editable.childNodes[2], 3);

    fireEvent.keyDown(editable, { key: 'Backspace' });

    expect(editable.querySelectorAll('[data-ref-name]')).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RefTextArea — Enter handling', () => {
  test('Enter is blocked in single-line mode (rows <= 2)', () => {
    render(<RefTextArea value="" onChange={jest.fn()} rows={1} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    const notPrevented = fireEvent.keyDown(editable, { key: 'Enter' });
    expect(notPrevented).toBe(false);
  });

  test('Enter is allowed in multi-line mode', () => {
    render(<RefTextArea value="" onChange={jest.fn()} rows={4} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    const notPrevented = fireEvent.keyDown(editable, { key: 'Enter' });
    expect(notPrevented).toBe(true);
  });
});

describe('RefTextArea — copy and paste with refs', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        metrics: [{ name: 'revenue', config: {} }],
        models: [{ name: 'orders', config: {} }],
      });
    });
  });

  test('copy serializes selected pills back to ref strings', () => {
    render(
      <RefTextArea value={R('revenue') + ' + 1'} onChange={jest.fn()} allowedTypes={['metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');

    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const setData = jest.fn();
    fireEvent.copy(editable, { clipboardData: { setData } });

    expect(setData).toHaveBeenCalledWith('text/plain', R('revenue') + ' + 1');
  });

  test('pasting text containing refs renders pills and round-trips the value', () => {
    const onChange = jest.fn();
    render(<RefTextArea value="" onChange={onChange} allowedTypes={['model']} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    placeCursorAtEnd(editable);

    paste(editable, 'x ' + R('orders') + ' y');

    expect(editable.querySelectorAll('[data-ref-name="orders"]')).toHaveLength(1);
    expect(onChange).toHaveBeenCalledWith('x ' + R('orders') + ' y');
  });

  test('pasting empty text is a no-op', () => {
    const onChange = jest.fn();
    render(<RefTextArea value="" onChange={onChange} allowedTypes={['model']} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    placeCursorAtEnd(editable);

    paste(editable, '');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('restrictBrackets paste that is only brackets is a no-op', () => {
    const onChange = jest.fn();
    render(
      <RefTextArea value="" onChange={onChange} allowedTypes={['model']} restrictBrackets />
    );
    const editable = screen.getByTestId('ref-textarea-editable');
    placeCursorAtEnd(editable);

    paste(editable, '[]');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RefTextArea — typed bracket gating (beforeinput)', () => {
  // React 18 synthesizes onBeforeInput from keypress; jsdom's KeyboardEvent
  // needs `which` and `inputType` defined explicitly for the full path.
  const pressChar = (el, char) => {
    const code = char.charCodeAt(0);
    const evt = new KeyboardEvent('keypress', {
      charCode: code,
      keyCode: code,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(evt, 'which', { value: code });
    Object.defineProperty(evt, 'inputType', { value: 'insertText' });
    return fireEvent(el, evt);
  };

  test('typed [ and ] are blocked in restrictBrackets mode, other chars pass', () => {
    render(<RefTextArea value="" onChange={jest.fn()} restrictBrackets />);
    const editable = screen.getByTestId('ref-textarea-editable');

    expect(pressChar(editable, '[')).toBe(false);
    expect(pressChar(editable, ']')).toBe(false);
    expect(pressChar(editable, 'a')).toBe(true);
  });

  test('typed brackets pass through in free-form mode', () => {
    render(<RefTextArea value="" onChange={jest.fn()} />);
    const editable = screen.getByTestId('ref-textarea-editable');

    expect(pressChar(editable, '[')).toBe(true);
    expect(pressChar(editable, ']')).toBe(true);
  });

  test('blocks brackets on the real-browser event shape (no inputType on the synthetic event)', () => {
    // React 18 synthesizes onBeforeInput from keypress, so nativeEvent has no
    // inputType in real browsers — the gate must not depend on it.
    const pressCharBare = (el, char) => {
      const code = char.charCodeAt(0);
      const evt = new KeyboardEvent('keypress', {
        charCode: code,
        keyCode: code,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(evt, 'which', { value: code });
      return fireEvent(el, evt);
    };

    render(<RefTextArea value="" onChange={jest.fn()} restrictBrackets />);
    const editable = screen.getByTestId('ref-textarea-editable');

    expect(pressCharBare(editable, '[')).toBe(false);
    expect(pressCharBare(editable, ']')).toBe(false);
    expect(pressCharBare(editable, 'a')).toBe(true);
  });
});

describe('RefTextArea — composition (IME) input', () => {
  test('input during composition is deferred until compositionend', () => {
    const onChange = jest.fn();
    render(<RefTextArea value="" onChange={onChange} />);
    const editable = screen.getByTestId('ref-textarea-editable');

    fireEvent.compositionStart(editable);
    typeText(editable, 'abc');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(editable);
    expect(onChange).toHaveBeenCalledWith('abc');
  });
});

describe('RefTextArea — DnD insertion via ref-insert-at-cursor', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        metrics: [
          { name: 'revenue', config: {} },
          { name: 'cost', config: {} },
        ],
      });
    });
  });

  const dispatchInsert = (container, refExpr) => {
    const root = container.querySelector('[data-has-cursor]');
    act(() => {
      root.dispatchEvent(new CustomEvent('ref-insert-at-cursor', { detail: { refExpr } }));
    });
  };

  test('appends at the end when there is no saved cursor', () => {
    const onChange = jest.fn();
    const { container } = render(
      <RefTextArea value="a + b" onChange={onChange} allowedTypes={['metric']} />
    );

    dispatchInsert(container, R('revenue'));
    expect(onChange).toHaveBeenLastCalledWith('a + b' + R('revenue'));
  });

  test('inserts at the cursor position saved on blur (splits text)', () => {
    const onChange = jest.fn();
    const { container } = render(
      <RefTextArea value="ab + cd" onChange={onChange} allowedTypes={['metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');

    fireEvent.focus(editable);
    setCursor(editable.firstChild, 2);
    fireEvent.blur(editable);

    dispatchInsert(container, R('revenue'));
    expect(onChange).toHaveBeenLastCalledWith('ab' + R('revenue') + ' + cd');
  });

  test('accounts for existing pills when locating the saved cursor', () => {
    const onChange = jest.fn();
    const { container } = render(
      <RefTextArea value={R('revenue') + 'x'} onChange={onChange} allowedTypes={['metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');

    fireEvent.focus(editable);
    // Cursor at the start of the 'x' text node — right after the pill
    setCursor(editable.childNodes[2], 0);
    fireEvent.blur(editable);

    dispatchInsert(container, R('cost'));
    expect(onChange).toHaveBeenLastCalledWith(R('revenue') + R('cost') + 'x');
  });

  test('ignores events whose payload has no ref expression', () => {
    const onChange = jest.fn();
    const { container } = render(
      <RefTextArea value="a" onChange={onChange} allowedTypes={['metric']} />
    );

    dispatchInsert(container, 'not a ref');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RefTextArea — click cursor resolution around pills', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({ metrics: [{ name: 'revenue', config: {} }] });
    });
  });

  test('a click right of a pill lands the caret in the text node after it', async () => {
    render(<RefTextArea value={R('revenue')} onChange={jest.fn()} allowedTypes={['metric']} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    // DOM: [zws][pill][zws]; simulate the browser leaving the caret at the container
    setCursor(editable, 0);

    fireEvent.click(editable, { clientX: 100 });

    await waitFor(() => {
      expect(window.getSelection().anchorNode).toBe(editable.childNodes[2]);
    });
    expect(window.getSelection().anchorOffset).toBe(1);
  });

  test('a click left of a pill lands the caret in the text node before it', async () => {
    render(<RefTextArea value={R('revenue')} onChange={jest.fn()} allowedTypes={['metric']} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    setCursor(editable, 0);

    fireEvent.click(editable, { clientX: -100 });

    await waitFor(() => {
      expect(window.getSelection().anchorNode).toBe(editable.childNodes[0]);
    });
    expect(window.getSelection().anchorOffset).toBe(1);
  });

  test('a caret inside a pill label is relocated outside the pill', async () => {
    render(<RefTextArea value={R('revenue')} onChange={jest.fn()} allowedTypes={['metric']} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    const pill = editable.querySelector('[data-ref-name="revenue"]');
    const labelText = Array.from(pill.querySelectorAll('span'))
      .map(s => s.firstChild)
      .find(n => n && n.nodeType === Node.TEXT_NODE && n.textContent === 'revenue');
    setCursor(labelText, 1);

    fireEvent.click(editable, { clientX: 100 });

    await waitFor(() => {
      const sel = window.getSelection();
      expect(sel.anchorNode).toBe(editable.childNodes[2]);
    });
  });

  test('a valid caret in plain text is left where it is', async () => {
    render(<RefTextArea value="plain text" onChange={jest.fn()} />);
    const editable = screen.getByTestId('ref-textarea-editable');
    setCursor(editable.firstChild, 3);

    fireEvent.click(editable, { clientX: 50 });

    // Flush the microtask the handler schedules
    await act(async () => {
      await Promise.resolve();
    });
    const sel = window.getSelection();
    expect(sel.anchorNode).toBe(editable.firstChild);
    expect(sel.anchorOffset).toBe(3);
  });
});

describe('RefTextArea — rendering', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        metrics: [
          { name: 'revenue', config: {} },
          { name: 'cost', config: {} },
        ],
      });
    });
  });

  test('adjacent refs render as separate pills and round-trip on copy', () => {
    render(
      <RefTextArea value={R('revenue') + R('cost')} onChange={jest.fn()} allowedTypes={['metric']} />
    );
    const editable = screen.getByTestId('ref-textarea-editable');
    expect(editable.querySelectorAll('[data-ref-name]')).toHaveLength(2);

    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const setData = jest.fn();
    fireEvent.copy(editable, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith('text/plain', R('revenue') + R('cost'));
  });

  test('shows label with required marker, helper text, and placeholder when empty', () => {
    render(
      <RefTextArea
        value=""
        onChange={jest.fn()}
        label="Expression"
        required
        helperText="Use @ to reference objects"
      />
    );
    expect(screen.getByText('Expression')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('Use @ to reference objects')).toBeInTheDocument();
    expect(screen.getByText('Type @ to insert a reference')).toBeInTheDocument();
  });

  test('shows the error message instead of helper text', () => {
    render(
      <RefTextArea
        value=""
        onChange={jest.fn()}
        helperText="helper"
        error="Something is wrong"
      />
    );
    expect(screen.getByText('Something is wrong')).toBeInTheDocument();
    expect(screen.queryByText('helper')).not.toBeInTheDocument();
  });

  test('disabled editors are not contentEditable', () => {
    render(<RefTextArea value="" onChange={jest.fn()} disabled />);
    expect(screen.getByTestId('ref-textarea-editable')).toHaveAttribute(
      'contenteditable',
      'false'
    );
  });
});
