interface Props {
  id: string;
  label: string;
  value: string;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
  onChange: (value: string) => void;
}

export function TextArea({ id, label, value, rows = 4, placeholder, maxLength, hint, onChange }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        {...(placeholder ? { placeholder } : {})}
        {...(maxLength ? { maxLength } : {})}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}
