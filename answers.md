Questions & Answers:

  1. Typing UX Behavior: When a user clicks the ModelDropdown pill, should it:
    - Transform into a text input box (replacing the pill visually) where they can type, with filtered
  suggestions appearing in a dropdown below?
    - Or keep the current dropdown behavior but make the input field more visually integrated with the
  pill?
  ANSWER: It should still keep the current drop down behavior BUT it should replace the "No Model" with an input box within the pill that has a prompt "type to create model..."
  2. Minimum Width:
    - What minimum width would you like? (e.g., 150px, 200px, 250px?)
    - Should this apply always, or only when showing "No model"?
  ANSWER: It should always apply, the width of the pill is currently set by the size of the model name, however it should just be a fixed value at different window widths. 
  3. Complete Status Removal:
    - Should we remove the entire "Complete" badge/indicator?
    - Or would you like to keep a subtle visual indicator (like just a small checkmark icon) that the query
   finished successfully?
  ANSWER: Just remove it, it's redundent with the query results pannel
  4. Placeholder Text: When the typing mode is active, should we show placeholder text like "Type to create
   or select model..." to guide users?
  ANSWER: Yes, but once they start typing just use their input
  5. Modified Indicator: Should the orange dot (showing a model has been modified) remain visible during
  typing mode?
  ANSWER: Nah just once there's an model that has yet to be saved. 