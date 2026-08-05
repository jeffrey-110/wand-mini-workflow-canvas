import { OUTPUT_DESTINATIONS, TRANSFORM_OPS, type InputConfig, type NodeRunState, type OutputConfig, type TransformConfig } from '@repo/types';
import { NODE_KIND_META } from '@repo/workflow';

import { Button, Pill, SelectField, TextArea, TextField } from '../components/index.ts';
import { formatDuration, NODE_STATUS_META } from '../lib/status.ts';
import { useGraphStore, useIsRunActive, useRunStore } from '../state/index.ts';

/**
 * The side panel.
 *
 * **Edits write through on every keystroke — there is no draft state and no
 * Save button.** A builder where changes might or might not have stuck is a
 * builder people stop trusting, and the graph is cheap to update. Validation is
 * advisory and derived, so nothing here can be "saved into a broken state"
 * without the canvas saying so immediately.
 *
 * The panel also doubles as the run detail view: after a run, selecting a step
 * shows what it produced or why it didn't. That's deliberate — it means there's
 * no separate log panel to go hunting in.
 */
export function StepInspector() {
  const node = useGraphStore((state) => state.nodes.find((candidate) => candidate.id === state.selectedNodeId) ?? null);
  const updateConfig = useGraphStore((state) => state.updateConfig);
  const deleteNode = useGraphStore((state) => state.deleteNode);
  const runState = useRunStore((state) => (state.runId && node ? state.nodeStates[node.id] : undefined));
  const isRunning = useIsRunActive();

  if (!node) {
    return (
      <aside className="inspector inspector--empty" aria-label="Step settings">
        <div className="inspector__placeholder">
          <p className="inspector__placeholder-title">No step selected</p>
          <p>Click a step on the canvas to edit what it does.</p>
        </div>
      </aside>
    );
  }

  const meta = NODE_KIND_META[node.data.kind];

  return (
    <aside className="inspector" aria-label={`Settings for ${node.data.config.label}`}>
      <header className="inspector__head">
        <div>
          <span className="inspector__kind" data-kind={node.data.kind}>
            {meta.title}
          </span>
          <p className="inspector__blurb">{meta.blurb}</p>
        </div>
        <Button variant="danger" onClick={() => deleteNode(node.id)} disabled={isRunning} title={isRunning ? "Can't edit the graph while a run is in flight" : 'Delete this step'}>
          Delete
        </Button>
      </header>

      {/* Keyed on the node id so switching selection remounts the fields —
          otherwise React reuses the inputs and the autofocus never re-fires. */}
      <div className="inspector__fields" key={node.id}>
        <TextField
          id="step-label"
          label="Name"
          value={node.data.config.label}
          maxLength={80}
          placeholder={meta.title}
          autoFocus
          onChange={(label) => updateConfig(node.id, { label })}
        />

        {node.data.kind === 'input' ? (
          <InputFields config={node.data.config} onChange={(patch) => updateConfig(node.id, patch)} />
        ) : node.data.kind === 'transform' ? (
          <TransformFields config={node.data.config} onChange={(patch) => updateConfig(node.id, patch)} />
        ) : (
          <OutputFields config={node.data.config} onChange={(patch) => updateConfig(node.id, patch)} />
        )}
      </div>

      {runState ? <RunDetail state={runState} /> : null}
    </aside>
  );
}

function InputFields({ config, onChange }: { config: InputConfig; onChange: (patch: Partial<InputConfig>) => void }) {
  return (
    <TextArea
      id="step-value"
      label="Seed value"
      value={config.value}
      maxLength={2_000}
      placeholder="The value this workflow starts from"
      hint="Passed to every step connected downstream."
      onChange={(value) => onChange({ value })}
    />
  );
}

function TransformFields({ config, onChange }: { config: TransformConfig; onChange: (patch: Partial<TransformConfig>) => void }) {
  return (
    <>
      <SelectField
        id="step-operation"
        label="Operation"
        value={config.operation}
        options={TRANSFORM_OPS.map((operation) => ({ value: operation, label: operation }))}
        onChange={(operation) => onChange({ operation: operation as TransformConfig['operation'] })}
      />
      {/* Only shown for the one operation that reads it. The stored value is
          kept when you switch away, so flipping between operations doesn't
          silently discard what you typed. */}
      {config.operation === 'prefix' ? (
        <TextField id="step-prefix" label="Prefix" value={config.prefix} maxLength={200} placeholder="e.g. note/" onChange={(prefix) => onChange({ prefix })} />
      ) : null}
    </>
  );
}

function OutputFields({ config, onChange }: { config: OutputConfig; onChange: (patch: Partial<OutputConfig>) => void }) {
  return (
    <SelectField
      id="step-destination"
      label="Destination"
      value={config.destination}
      options={OUTPUT_DESTINATIONS.map((destination) => ({ value: destination, label: destination }))}
      hint="Simulated — nothing leaves the process."
      onChange={(destination) => onChange({ destination: destination as OutputConfig['destination'] })}
    />
  );
}

function RunDetail({ state }: { state: NodeRunState }) {
  const meta = NODE_STATUS_META[state.status];

  return (
    <section className="inspector__run">
      <h3>This run</h3>
      <dl>
        <dt>Status</dt>
        <dd>
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </dd>

        {state.startedAt !== undefined && state.finishedAt !== undefined ? (
          <>
            <dt>Took</dt>
            <dd>{formatDuration(state.startedAt, state.finishedAt)}</dd>
          </>
        ) : null}

        {state.output !== undefined ? (
          <>
            <dt>Output</dt>
            <dd>
              <code className="inspector__output">{state.output || '(empty string)'}</code>
            </dd>
          </>
        ) : null}

        {state.error ? (
          <>
            <dt>Error</dt>
            <dd className="inspector__error">{state.error}</dd>
          </>
        ) : null}

        {state.skippedBecauseOf ? (
          <>
            <dt>Why skipped</dt>
            <dd>An upstream step failed, so this one never received an input.</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}
