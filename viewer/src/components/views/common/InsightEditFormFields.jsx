import React from 'react';
import TracePropsEditor from './TracePropsEditor';
import { SectionContainer, SectionTitle } from '../../styled/FormLayoutComponents';

/**
 * InsightEditFormFields — VIS-1224. The shared, fully-controlled body of the
 * insight edit panel: the "Basic Information" (name + description) and
 * "Visualization Props" sections that the standard RightRail form
 * (`InsightEditForm`) and the Explorer Build-rail draft pane
 * (`InsightBuildSection`) both render, so the two surfaces show the SAME panel
 * (the ticket's parity ask — no more colored-sidebar divergence).
 *
 * It owns NO state and NO persistence — every value/handler is a prop, so each
 * host keeps its own model: the saved-record form persists on Save via a
 * baseline; the Explorer writes through to `explorerStore` live and threads its
 * drag-and-drop (`droppable`/`onDropField`) + Save-as-metric
 * (`onSaveAsMetric`) into the shared `TracePropsEditor`. Interactions diverge
 * enough (DnD zones, ref-wrap convention) that each host renders its own
 * Interactions section AFTER this one.
 */
const InsightEditFormFields = ({
  // ---- Basic Information · name ----
  showName = true,
  nameId = 'insightName',
  nameLabel = 'Insight Name',
  nameRequired = true,
  nameValue,
  onNameChange,
  onNameBlur,
  onNameKeyDown,
  nameDisabled = false,
  nameError,
  nameErrorTestId,
  nameInputRef,
  nameTestId,
  // ---- Basic Information · description ----
  showDescription = true,
  description,
  onDescriptionChange,
  // ---- Visualization Props ----
  ownerName,
  props,
  onPropsChange,
  onValidityChange,
  droppable = false,
  onDropField,
  onSaveAsMetric,
  externalErrors,
  propsError,
  propsTypeError,
}) => (
  <>
    <SectionContainer>
      <SectionTitle>Basic Information</SectionTitle>

      {showName && (
        <div className="relative">
          <input
            ref={nameInputRef}
            type="text"
            id={nameId}
            data-testid={nameTestId}
            value={nameValue}
            onChange={onNameChange}
            onBlur={onNameBlur}
            onKeyDown={onNameKeyDown}
            disabled={nameDisabled}
            placeholder=" "
            className={`
              block w-full px-3 py-2.5 text-sm text-gray-900
              bg-white rounded-md border appearance-none
              focus:outline-none focus:ring-2 focus:border-primary-500
              peer placeholder-transparent
              ${nameDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}
              ${nameError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
            `}
          />
          <label
            htmlFor={nameId}
            className={`
              absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
              bg-white px-1 left-2
              peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:top-1/2
              peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
              ${nameError ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
            `}
          >
            {nameLabel}
            {nameRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {nameError && (
            <p className="mt-1 text-xs text-red-500" data-testid={nameErrorTestId}>
              {nameError}
            </p>
          )}
        </div>
      )}

      {showDescription && (
        <div className="relative">
          <textarea
            id={`${nameId}Description`}
            value={description}
            onChange={onDescriptionChange}
            placeholder=" "
            rows={2}
            className="block w-full px-3 py-2.5 text-sm text-gray-900 bg-white rounded-md border border-gray-300 appearance-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 peer placeholder-transparent resize-y"
          />
          <label
            htmlFor={`${nameId}Description`}
            className="absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-1 left-2 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-3 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 text-gray-500 peer-focus:text-primary-500"
          >
            Description
          </label>
        </div>
      )}
    </SectionContainer>

    <SectionContainer>
      <SectionTitle>Visualization Props</SectionTitle>
      {/* Grouped, schema-driven, AJV-validated props editor. Fully controlled;
          the Explorer additionally threads its DnD + Save-as-metric here. */}
      <TracePropsEditor
        ownerName={ownerName}
        props={props}
        onChange={onPropsChange}
        onValidityChange={onValidityChange}
        droppable={droppable}
        onDropField={onDropField}
        onSaveAsMetric={onSaveAsMetric}
        externalErrors={externalErrors}
      />
      {propsError && (
        <p className="mt-1 text-xs text-red-500" data-testid="insight-props-invalid">
          {propsError}
        </p>
      )}
      {propsTypeError && <p className="mt-1 text-xs text-red-500">{propsTypeError}</p>}
    </SectionContainer>
  </>
);

export default InsightEditFormFields;
