interface Props {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}

export function TextField({ id, label, value, placeholder, maxLength, hint, autoFocus, onChange }: Props) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        {...(placeholder ? { placeholder } : {})}
        {...(maxLength ? { maxLength } : {})}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the panel only
        // appears in response to the user selecting a node, so focusing the
        // first field is following them rather than stealing from them.
        autoFocus={autoFocus ?? false}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}
