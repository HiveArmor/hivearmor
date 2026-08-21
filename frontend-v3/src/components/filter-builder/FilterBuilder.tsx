import { Plus, X } from 'lucide-react';

export interface FilterBuilderProps {
  value: FilterClause[];
  onChange: (filters: FilterClause[]) => void;
  availableFields: FieldDefinition[];
  maxFilters?: number;
}

export interface FieldDefinition {
  name: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  enumValues?: string[];
}

export interface FilterClause {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'not_in';
  value: string | number | boolean | string[];
}

const OPERATOR_LABELS: Record<FilterClause['operator'], string> = {
  eq: 'equals',
  neq: 'not equals',
  gt: 'greater than',
  gte: 'greater than or equal',
  lt: 'less than',
  lte: 'less than or equal',
  contains: 'contains',
  in: 'in',
  not_in: 'not in',
};

function getOperatorsForType(type: FieldDefinition['type']): FilterClause['operator'][] {
  switch (type) {
    case 'string':
      return ['eq', 'neq', 'contains'];
    case 'number':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
    case 'date':
      return ['gt', 'lt'];
    case 'enum':
      return ['in', 'not_in'];
    case 'boolean':
      return ['eq'];
    default:
      return ['eq'];
  }
}

export function FilterBuilder({
  value,
  onChange,
  availableFields,
  maxFilters = 10,
}: FilterBuilderProps): JSX.Element {
  const addFilter = () => {
    if (value.length >= maxFilters) return;
    const newFilter: FilterClause = {
      field: availableFields[0]?.name || '',
      operator: 'eq',
      value: '',
    };
    onChange([...value, newFilter]);
  };

  const removeFilter = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, updates: Partial<FilterClause>) => {
    const updated = value.map((filter, i) =>
      i === index ? { ...filter, ...updates } : filter
    );
    onChange(updated);
  };

  return (
    <div className="filter-builder" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {value.map((filter, index) => {
        const field = availableFields.find((f) => f.name === filter.field);
        const operators: FilterClause['operator'][] = field ? getOperatorsForType(field.type) : ['eq'];

        return (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px',
              background: 'var(--ha-surface-raised)',
              border: '1px solid var(--ha-border)',
              borderRadius: 'var(--ha-radius-base)',
            }}
          >
            <select
              value={filter.field}
              onChange={(e) => updateFilter(index, { field: e.target.value })}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-sm)',
              }}
            >
              {availableFields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>

            <select
              value={filter.operator}
              onChange={(e) => updateFilter(index, { operator: e.target.value as FilterClause['operator'] })}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-sm)',
              }}
            >
              {operators.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={String(filter.value)}
              onChange={(e) => updateFilter(index, { value: e.target.value })}
              style={{
                flex: 2,
                padding: '6px 8px',
                background: 'var(--ha-surface-primary)',
                border: '1px solid var(--ha-border)',
                borderRadius: 'var(--ha-radius-base)',
                color: 'var(--ha-text-primary)',
                fontSize: 'var(--ha-text-sm)',
              }}
              placeholder="Value"
            />

            <button
              onClick={() => removeFilter(index)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--ha-text-secondary)',
              }}
              aria-label="Remove filter"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}

      {value.length < maxFilters && (
        <button
          onClick={addFilter}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'transparent',
            border: '1px dashed var(--ha-border)',
            borderRadius: 'var(--ha-radius-base)',
            color: 'var(--ha-primary)',
            fontSize: 'var(--ha-text-sm)',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          Add filter
        </button>
      )}
    </div>
  );
}
