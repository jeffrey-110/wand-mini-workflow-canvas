/**
 * UI primitives.
 *
 * Everything here is domain-agnostic: no imports from `@repo/types` or
 * `@repo/workflow`, and no knowledge of workflows, nodes, or runs. That's the
 * rule that keeps the boundary honest — if a component needs a domain type, it
 * belongs in `containers/`. It's phrased that way so it can be checked:
 *
 *   grep -rn "@repo/types\|@repo/workflow" src/components/   # must be empty
 *
 * `Toaster` is the one exception that touches a store, because a toast host has
 * to subscribe to something to exist at all — but the store it reads is itself
 * domain-free.
 */

export { Button } from './Button.tsx';
export { Pill } from './Pill.tsx';
export { ProgressBar } from './ProgressBar.tsx';
export { SelectField, type Option } from './SelectField.tsx';
export { TextArea } from './TextArea.tsx';
export { TextField } from './TextField.tsx';
export { Toaster } from './Toaster.tsx';
