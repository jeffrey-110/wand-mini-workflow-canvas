import { useEffect } from 'react';

import { isTerminalRunStatus } from '@repo/types';
import { validateWorkflow } from '@repo/workflow';

import { useGraphStore, useRunStore, useToastStore } from '../state/index.ts';

/**
 * Keyboard affordances — deliberately few, and all of them things a user
 * reaches for in the first minute:
 *
 *   ⌘/Ctrl + ↵   run
 *   ⌘/Ctrl + .   cancel the run in flight
 *   Escape       deselect (and blur, if focus is in a field)
 *   ⌫ / Delete   delete the selected step — left to React Flow, which already
 *                scopes itself to the canvas and ignores text fields
 *
 * Every handler checks that focus isn't in a text field before firing. Skipping
 * that check is the single bug that makes most keyboard shortcuts feel broken —
 * you type a node name containing a full stop and the run cancels.
 *
 * Store values are read through `getState()` inside the handler rather than
 * subscribed to, so this hook doesn't re-register a listener on every run event.
 */
export function useKeyboardShortcuts(failureRate: number): void {
  useEffect(() => {
    function isEditing(target: EventTarget | null): boolean {
      return (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      );
    }

    function onKeyDown(event: KeyboardEvent): void {
      const editing = isEditing(event.target);

      if (event.key === 'Escape') {
        // Escape out of a field first, then out of the selection. Two presses
        // to go from "typing a name" to "nothing selected" is the behaviour
        // people expect from a panel.
        if (editing && event.target instanceof HTMLElement) event.target.blur();
        else useGraphStore.getState().select(null);
        return;
      }

      if (editing || event.altKey || event.shiftKey) return;
      if (!event.metaKey && !event.ctrlKey) return;

      const run = useRunStore.getState();
      const isActive = run.status !== null && !isTerminalRunStatus(run.status);

      if (event.key === 'Enter') {
        event.preventDefault();
        if (isActive || run.isStarting) return;

        const workflow = useGraphStore.getState().toWorkflow();
        if (!validateWorkflow(workflow).valid) {
          // The issue list is already on screen; this just explains why the
          // keypress did nothing.
          useToastStore.getState().push({ tone: 'warn', message: 'Fix the errors below before running.' });
          return;
        }
        void run.start(workflow, { failureRate });
        return;
      }

      if (event.key === '.') {
        event.preventDefault();
        if (isActive) void run.cancel();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [failureRate]);
}
