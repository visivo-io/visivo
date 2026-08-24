import React from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { SchemaEditor } from './SchemaEditor/SchemaEditor';

/**
 * ChartEditFormFields — VIS-1224. The shared, fully-controlled chrome of the
 * chart edit panel: "Basic Information" (name), an insight-selection SLOT, and
 * "Layout Configuration", rendered by both the standard RightRail form
 * (`ChartEditForm`) and the Explorer Build-rail draft pane (`ChartBuildSection`)
 * so the two show the same panel.
 *
 * The insight selection genuinely differs between the two surfaces — the
 * standard form offers ref-swap Selects + an inline per-insight props picker,
 * while the Explorer edits insights in their own stacked panes and needs a
 * drop zone + click-to-activate — so it is passed in as `insightsSection`
 * rather than shared. Layout `SchemaEditor` extras (droppable, hidePropertyCount…)
 * are forwarded via `layoutEditorProps`.
 */
const ChartEditFormFields = ({
  // ---- Basic Information · name ----
  showName = true,
  nameId = 'chartName',
  nameLabel = 'Chart Name',
  nameRequired = true,
  nameValue,
  onNameChange,
  onNameBlur,
  onNameFocus,
  onNameKeyDown,
  nameDisabled = false,
  nameError,
  nameErrorTestId,
  nameInputRef,
  nameTestId,
  // ---- Insight selection (host-provided) ----
  insightsSection,
  // ---- Layout Configuration ----
  layoutTitle = 'Layout Configuration (Optional)',
  layoutSchema,
  layoutValues,
  onLayoutChange,
  layoutLoading = false,
  layoutError,
  layoutEditorProps = {},
  layoutHint,
}) => (
  <>
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
        Basic Information
      </h3>

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
            onFocus={onNameFocus}
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
    </div>

    {insightsSection}

    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700 border-b border-gray-200 pb-2">
        {layoutTitle}
      </h3>
      {layoutLoading ? (
        <div className="flex items-center justify-center py-8">
          <CircularProgress size={24} />
          <span className="ml-2 text-sm text-gray-600">Loading schema...</span>
        </div>
      ) : layoutError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{layoutError}</p>
        </div>
      ) : layoutSchema ? (
        <SchemaEditor
          schema={layoutSchema}
          value={layoutValues}
          onChange={onLayoutChange}
          {...layoutEditorProps}
        />
      ) : null}
      {layoutHint}
    </div>
  </>
);

export default ChartEditFormFields;
