import React, { useState, useRef, useEffect } from 'react';
import { PiCaretDown, PiCode } from 'react-icons/pi';

/**
 * Starter SQL templates offered to new users when the editor is empty.
 * Each template's `sql` is a function that takes an optional table name and
 * returns a SQL string. When `table` is not provided, the placeholder
 * `your_table` is used so users can clearly see where to substitute names.
 */
export const SQL_TEMPLATES = [
  {
    id: 'select-all',
    label: 'Show all rows from a table',
    description: 'SELECT * with a LIMIT — good for exploring',
    sql: (table) => `SELECT *\nFROM ${table || 'your_table'}\nLIMIT 100;`,
  },
  {
    id: 'count-by-category',
    label: 'Count rows by category',
    description: 'COUNT and GROUP BY — counts per group',
    sql: (table) =>
      `SELECT category_column, COUNT(*) AS row_count\nFROM ${table || 'your_table'}\nGROUP BY category_column\nORDER BY row_count DESC;`,
  },
  {
    id: 'sum-by-month',
    label: 'Aggregate by month',
    description: 'Sum a numeric column grouped by month',
    sql: (table) =>
      `SELECT date_trunc('month', date_column) AS month,\n       SUM(amount_column) AS total\nFROM ${table || 'your_table'}\nGROUP BY 1\nORDER BY 1;`,
  },
  {
    id: 'top-n',
    label: 'Top 10 by a metric',
    description: 'Sorted, limited result set',
    sql: (table) =>
      `SELECT name, value\nFROM ${table || 'your_table'}\nORDER BY value DESC\nLIMIT 10;`,
  },
  {
    id: 'join-two',
    label: 'Join two tables',
    description: 'INNER JOIN pattern',
    sql: () =>
      `SELECT a.id, a.name, b.value\nFROM table_a a\nJOIN table_b b ON b.a_id = a.id\nLIMIT 100;`,
  },
  {
    id: 'distinct-values',
    label: 'List distinct values',
    description: 'Unique values from a column',
    sql: (table) =>
      `SELECT DISTINCT category_column\nFROM ${table || 'your_table'}\nORDER BY 1;`,
  },
];

/**
 * SQLTemplateMenu - Dropdown picker for starter SQL queries.
 *
 * Props:
 * - onPick: (sqlString) => void  — called with the rendered SQL when a template is selected
 * - currentTable: string | null  — optional table name to substitute into templates
 * - label: string                — visible button label (default: "Use a SQL template")
 */
const SQLTemplateMenu = ({ onPick, currentTable, label = 'Use a SQL template' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handlePick = (template) => {
    onPick?.(template.sql(currentTable));
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={dropdownRef} data-testid="sql-template-menu">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={`
          w-full flex items-center justify-between gap-2
          px-3 py-2 rounded-md border text-sm font-medium
          transition-colors
          ${
            isOpen
              ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50 text-primary-700'
              : 'border-secondary-300 hover:border-primary-400 bg-white text-secondary-700'
          }
        `}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-testid="sql-template-menu-trigger"
      >
        <span className="flex items-center gap-2">
          <PiCode size={14} className="text-primary" />
          {label}
        </span>
        <PiCaretDown
          size={12}
          className={`text-secondary-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg border border-secondary-200 z-50 py-1 max-h-80 overflow-y-auto"
          role="menu"
          data-testid="sql-template-menu-list"
        >
          {SQL_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => handlePick(template)}
              className="w-full text-left px-3 py-2 hover:bg-primary-50 transition-colors flex flex-col gap-0.5"
              role="menuitem"
              data-testid={`sql-template-${template.id}`}
            >
              <span className="text-sm font-medium text-secondary-800">{template.label}</span>
              <span className="text-xs text-secondary-500">{template.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SQLTemplateMenu;
