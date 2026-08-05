import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: 'primary' | 'ghost' | 'danger';
  /** Rendered as a dimmed keycap after the label, e.g. ⌘↵. */
  shortcut?: string;
  children: ReactNode;
}

export function Button({ variant = 'ghost', shortcut, children, type = 'button', ...rest }: Props) {
  return (
    <button className={`btn btn--${variant}`} type={type} {...rest}>
      {children}
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}
