import { useToastStore } from '../state/toast.store.ts';

/**
 * Bottom-centre transient messages. `aria-live="polite"` so a screen reader
 * announces them without interrupting whatever the user is doing — these are
 * never urgent enough for `assertive`.
 *
 * The whole toast is the dismiss target: they're small and short-lived, and a
 * separate ✕ would be a smaller hit area for no benefit.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} type="button" className="toast" data-tone={toast.tone} onClick={() => dismiss(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  );
}
