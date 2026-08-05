interface Props {
  /** 0–100. Clamped, so a caller's rounding can't overflow the track. */
  percent: number;
  tone: string;
  label: string;
}

/**
 * A determinate bar rather than a spinner: during a run the user needs to know
 * how much is left and whether anything has gone wrong, and a spinner answers
 * neither question.
 */
export function ProgressBar({ percent, tone, label }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="progress" data-tone={tone} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span className="progress__fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}
