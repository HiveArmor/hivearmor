import { useCallback, useEffect, useRef, useState } from 'react';

import { Plus, X } from 'lucide-react';

import { HaCompactSelect } from '@/components/ha-compact-select/HaCompactSelect';
import { ALERT_FILTER_FIELDS, type AlertFilterField, type AlertQueryJoin } from '@/lib/alertFilterFields';

import './AddFilterPopover.css';

export type StructuredFilterOperator = 'is' | 'is_not' | 'contains';

export interface StructuredAlertFilter {
  field: string;
  paramKey: string;
  label: string;
  operator: StructuredFilterOperator;
  value: string;
  conjunction: AlertQueryJoin;
}

export interface AddFilterPopoverProps {
  hasExistingExpression?: boolean;
  onAddFilter: (filter: StructuredAlertFilter) => void;
}

export function AddFilterPopover({ hasExistingExpression = false, onAddFilter }: AddFilterPopoverProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<AlertFilterField | null>(null);
  const [operator, setOperator] = useState<StructuredFilterOperator>('is');
  const [conjunction, setConjunction] = useState<AlertQueryJoin>('AND');
  const [value, setValue] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const resetForm = useCallback((): void => {
    setSelectedField(null);
    setOperator('is');
    setConjunction('AND');
    setValue('');
  }, []);

  const close = useCallback((): void => {
    setIsOpen(false);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) close();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, isOpen]);

  const handleSubmit = (): void => {
    if (!selectedField || !value.trim()) return;
    onAddFilter({
      field: selectedField.field,
      paramKey: selectedField.paramKey,
      label: selectedField.label,
      operator,
      value: value.trim(),
      conjunction,
    });
    close();
  };

  return (
    <div className="add-alert-filter" ref={popoverRef}>
      <button type="button" className="add-alert-filter__trigger" onClick={() => setIsOpen((current) => !current)} aria-label="Add filter" aria-expanded={isOpen} aria-haspopup="dialog">
        <Plus size={14} aria-hidden="true" />Add filter
      </button>

      {isOpen && (
        <section className="add-alert-filter__popover" role="dialog" aria-modal="false" aria-labelledby="add-alert-filter-title">
          <header>
            <div><strong id="add-alert-filter-title">Add filter condition</strong><span>Build an allowlisted alert query.</span></div>
            <button type="button" onClick={close} aria-label="Close filter builder"><X size={15} /></button>
          </header>

          <div className="add-alert-filter__body">
            {hasExistingExpression && (
              <fieldset className="add-alert-filter__join">
                <legend>Join with existing filters</legend>
                <div>
                  {(['AND', 'OR'] as const).map((join) => (
                    <button key={join} type="button" data-active={conjunction === join} onClick={() => setConjunction(join)} aria-pressed={conjunction === join}>
                      <strong>{join}</strong><span>{join === 'AND' ? 'Require both' : 'Match either'}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <HaCompactSelect
              ariaLabel="Field"
              label="Field"
              layout="stacked"
              value={selectedField?.field ?? ''}
              options={[{ value: '', label: 'Select field…' }, ...ALERT_FILTER_FIELDS.map((field) => ({ value: field.field, label: field.label }))]}
              onChange={(nextField) => {
                setSelectedField(ALERT_FILTER_FIELDS.find((field) => field.field === nextField) ?? null);
                setOperator('is');
                setValue('');
              }}
            />

            {selectedField && (
              <div className="add-alert-filter__condition">
                <HaCompactSelect
                  ariaLabel="Operator"
                  label="Operator"
                  layout="stacked"
                  value={operator}
                  options={[{ value: 'is', label: 'is' }, { value: 'is_not', label: 'is not' }, ...(selectedField.valueType !== 'enum' ? [{ value: 'contains' as const, label: 'contains' }] : [])]}
                  onChange={setOperator}
                />
                <div className="add-alert-filter__value">
                  {selectedField.valueType === 'enum' && selectedField.enumValues ? (
                    <HaCompactSelect ariaLabel="Value" label="Value" layout="stacked" value={value} options={[{ value: '', label: 'Select value…' }, ...selectedField.enumValues]} onChange={setValue} />
                  ) : (
                    <label><span>Value</span><input aria-label="Value" value={value} onChange={(event) => setValue(event.target.value)} placeholder={selectedField.valueType === 'ip' ? '192.168.1.1' : 'Enter value…'} /></label>
                  )}
                </div>
              </div>
            )}
          </div>

          <footer>
            <button type="button" onClick={close}>Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={!selectedField || !value.trim()}>Add condition</button>
          </footer>
        </section>
      )}
    </div>
  );
}
