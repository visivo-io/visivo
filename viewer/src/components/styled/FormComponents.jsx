/**
 * Form Styled Components
 *
 * Reusable form components with consistent styling for edit forms.
 * All components follow Material Design floating label pattern.
 */

export { default as FormInput } from './FormInput';
export { default as FormTextarea } from './FormTextarea';
export { default as FormSelect } from './FormSelect';
export { default as FormFooter } from './FormFooter';
export { default as FormAlert } from './FormAlert';
export { default as FormSection } from './FormSection';
export { default as FormCheckbox } from './FormCheckbox';

/**
 * FormLayout - Wrapper for form content with scrollable area
 *
 * Usage:
 * <FormLayout>
 *   <FormInput ... />
 *   <FormTextarea ... />
 * </FormLayout>
 * <FormFooter ... />
 */
export const FormLayout = ({ children, className = '' }) => (
  <div className={`flex-1 overflow-y-auto p-4 ${className}`}>
    <div className="space-y-5">{children}</div>
  </div>
);
