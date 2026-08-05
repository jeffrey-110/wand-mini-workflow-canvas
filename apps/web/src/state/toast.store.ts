import { create } from 'zustand';

/**
 * Transient messages for things that are true for a moment and then aren't: a
 * refused connection, a run finishing.
 *
 * Anything that stays true — validation errors, a failed run — belongs in the
 * layout, not in a toast that vanishes before the user has read it. That split
 * is the whole editorial rule for this store.
 */

export type ToastTone = 'info' | 'warn' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const VISIBLE_MS = 3_600;
const MAX_VISIBLE = 3;

let nextId = 0;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  push: (toast) => {
    nextId += 1;
    const id = nextId;

    set((state) => ({
      // Repeating the same message shouldn't stack — dragging at an illegal
      // target three times should read as one refusal, not three.
      toasts: [...state.toasts.filter((existing) => existing.message !== toast.message), { ...toast, id }].slice(-MAX_VISIBLE),
    }));

    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((existing) => existing.id !== id) })), VISIBLE_MS);
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((existing) => existing.id !== id) })),
}));
