import { useReactFlow } from '@xyflow/react';
import { useState } from 'react';

import type { ValidationIssue } from '@repo/types';

import { useValidation } from '../hooks/useValidation.ts';
import { useGraphStore, useRunStore } from '../state/index.ts';

/**
 * Every failure surface, in one place along the bottom of the canvas.
 *
 * Three distinct things can be wrong, and they look distinct on purpose:
 *
 *   - the request failed (API unreachable, run rejected) — red banner, `alert`
 *   - the stream dropped — amber banner, `status`, and it says it's retrying
 *   - the graph has errors (blocking) or warnings (not) — a collapsible list
 *
 * Every issue is clickable and pans the canvas to the offending step. A list of
 * problems you then have to *find* is only half a feature — especially once the
 * graph is bigger than the viewport.
 */
export function IssueList() {
  const validation = useValidation();
  const runError = useRunStore((state) => state.error);
  const streamState = useRunStore((state) => state.streamState);
  const hasNodes = useGraphStore((state) => state.nodes.length > 0);
  const select = useGraphStore((state) => state.select);
  const { fitView } = useReactFlow();
  const [collapsed, setCollapsed] = useState(false);

  const errors = validation.issues.filter((issue) => issue.severity === 'error');
  const warnings = validation.issues.filter((issue) => issue.severity === 'warning');
  const showIssues = hasNodes && validation.issues.length > 0;

  if (!runError && !showIssues && streamState !== 'reconnecting') return null;

  function focus(issue: ValidationIssue): void {
    const target = issue.nodeIds?.[0];
    if (!target) return;

    select(target);
    void fitView({ nodes: [{ id: target }], duration: 320, maxZoom: 1.1, padding: 0.6 });
  }

  return (
    <div className="issues">
      {runError ? (
        <div className="issues__banner" data-tone="error" role="alert">
          <strong>Couldn&rsquo;t start the run.</strong> {runError}
        </div>
      ) : null}

      {streamState === 'reconnecting' ? (
        <div className="issues__banner" data-tone="warn" role="status">
          <strong>Reconnecting.</strong> The live stream dropped — picking up from where it left off.
        </div>
      ) : null}

      {showIssues ? (
        <div className="issues__list">
          <button type="button" className="issues__toggle" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
            <span className="issues__caret" data-collapsed={collapsed ? '' : undefined} aria-hidden>
              ▾
            </span>
            {errors.length > 0 ? (
              <span className="issues__count" data-tone="error">
                {errors.length} error{errors.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="issues__count" data-tone="ok">
                Ready to run
              </span>
            )}
            {warnings.length > 0 ? (
              <span className="issues__count" data-tone="warn">
                {warnings.length} warning{warnings.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </button>

          {collapsed ? null : (
            <ul>
              {/* Errors first: they're the ones blocking the Run button. */}
              {[...errors, ...warnings].map((issue, index) => (
                <li key={`${issue.code}-${index}`} data-tone={issue.severity}>
                  <button type="button" onClick={() => focus(issue)} disabled={!issue.nodeIds?.length} title={issue.nodeIds?.length ? 'Show me' : undefined}>
                    <span className="issues__dot" aria-hidden />
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
