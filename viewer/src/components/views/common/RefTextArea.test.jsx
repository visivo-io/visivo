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
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RefTextArea from './RefTextArea';
import useStore from '../../../stores/store';

// Place the caret at the end of the editable so handlePaste has a range.
const placeCursorAtEnd = el => {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
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
});
