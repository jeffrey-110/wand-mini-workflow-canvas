import type { ReactNode } from 'react';

/**
 * A small status chip. `tone` is a free string rather than a union because the
 * mapping from run status to tone is domain knowledge, and this layer doesn't
 * have any — it just forwards the value to CSS as a data attribute.
 */
interface Props {
  tone: string;
  title?: string;
  children: ReactNode;
}

export function Pill({ tone, title, children }: Props) {
  return (
    <span className="pill" data-tone={tone} {...(title ? { title } : {})}>
      {children}
    </span>
  );
}
