export interface Option {
  value: string;
  label: string;
}

interface Props {
  id: string;
  label: string;
  value: string;
  options: readonly Option[];
  disabled?: boolean;
  hint?: string;
  title?: string;
  onChange: (value: string) => void;
}

export function SelectField({ id, label, value, options, disabled, hint, title, onChange }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={disabled ?? false} {...(title ? { title } : {})} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}
