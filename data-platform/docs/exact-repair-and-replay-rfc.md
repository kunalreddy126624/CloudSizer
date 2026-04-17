# Exact Repair and Replay RFC

Status: Draft

Owner: Data Platform

Last updated: 2026-04-15

## Summary

This RFC defines an `exact repair and replay` capability for the data platform.

The feature has two separate concerns:

- `Repair` is a control-plane capability that reruns only failed, skipped, or selected tasks within the lineage of an existing `PipelineRun`.
- `Exact` is a data-plane guarantee that repaired execution produces the same final external effects as one clean successful run.

The platform must not present repair as exact by default. Exactness is only available for tasks whose inputs are replayable, whose execution artifacts are pinned, and whose sinks are transactional or idempotent.

## Motivation

The current platform supports immutable `PipelineRun` and `TaskRun` records plus task retry. That is sufficient for demo-grade execution but not for production recovery.

The missing capabilities are:

- rerun a subset of tasks without rerunning the full pipeline
- preserve run history across repair attempts
- prevent duplicate writes and mixed-version outputs
- support bounded replay for partitions, time windows, or identifiers
- expose a clear operator workflow in API and UI

## Goals

- Extend the current run model with repair attempts attached to a root run.
- Support rerun scopes of `failed`, `failed_and_dependents`, and `selected`.
- Preserve a single run history across the original execution and all repairs.
- Add an explicit repair mode contract: `best_effort` or `exact`.
- Block `exact` repair when preconditions are not met.
- Capture enough metadata to support future lineage-aware replay.

## Non-goals

- Universal exactly-once guarantees for arbitrary external side effects such as emails, webhooks, or third-party APIs.
- Full streaming checkpoint and savepoint management in the MVP.
- Cross-system distributed transactions in the first release.
- Automatic lineage completeness across every engine from day one.

## Product Contract

### Repair modes

The platform supports two repair modes.

#### Best-effort repair

- Reruns selected tasks within a terminal `PipelineRun`.
- Reuses the original run lineage and creates a new repair attempt.
- May duplicate side effects if a sink is not idempotent or transactional.
- Must be visibly marked as best-effort in API and UI.

#### Exact repair

`Exact` repair is allowed only when every rerun task satisfies all of the following:

- inputs are pinned by version, snapshot, partition scope, or offset range
- code artifact, dependency set, and runtime config are pinned
- sink supports idempotent writes or atomic commit
- task has no unsupported side effects
- schema compatibility checks pass
- no active conflicting repair exists for the same root run

If any precondition fails, the request must be rejected with a reasoned validation error. The platform must not silently downgrade `exact` to `best_effort`.

## Key Definitions

- `Root run`: the original `PipelineRun` created by a user or scheduler trigger.
- `Repair attempt`: a rerun attempt attached to a root run.
- `Attempt`: either the original execution or a repair execution.
- `Replay`: bounded recomputation for a declared data scope such as partition, date range, or identifier set.
- `Pinned artifact`: exact pipeline version, code revision, container image, library set, and runtime config captured at submission time.
- `Supported sink`: a sink with a declared idempotency or transactional strategy.

## Semantics

### Repair semantics

- A repair is allowed only when the root run is in a terminal state.
- A repair may target:
  - all failed or skipped tasks
  - failed or skipped tasks plus downstream dependents
  - an explicit set of selected tasks, optionally plus dependents
- Tasks not included in the repair set are treated as reused outputs from a prior attempt.
- The final run view is the task-wise latest effective attempt for each node in the DAG.

### Exactness semantics

For supported workloads, the final externally visible outcome after an exact repair must be equivalent to one successful execution of the pipeline for the same logical input scope.

This means:

- no duplicate committed sink effects
- no partial sink commits exposed as final output
- no mixed artifact versions within one exact attempt
- no reuse of downstream outputs that were derived from invalidated upstream data

### Reuse rules for prior successful tasks

Successful task outputs from an earlier attempt may be reused only when both conditions hold:

- none of their transitive upstream inputs were repaired
- the task artifact, config, and declared input scope remain identical

If either condition is false, the task must be added to the repair plan or the exact repair must be rejected.

## Proposed Data Model

The current model has `PipelineRun` and `TaskRun`. This RFC extends rather than replaces those entities.

### New entities

#### `PipelineRunAttempt`

Represents one execution attempt within a root `PipelineRun`.

Suggested fields:

- `id`
- `pipeline_run_id`
- `attempt_number`
- `attempt_kind` with values `initial` or `repair`
- `repair_mode` with values `best_effort` or `exact`
- `state`
- `created_by`
- `reason`
- `rerun_policy`
- `parameter_overrides_json`
- `artifact_snapshot_json`
- `input_pin_snapshot_json`
- `started_at`
- `finished_at`

#### `TaskRunAttempt`

Represents one execution of a task within a specific attempt.

Suggested fields:

- `id`
- `pipeline_run_attempt_id`
- `pipeline_run_id`
- `node_id`
- `node_name`
- `state`
- `write_token`
- `input_snapshot_json`
- `output_snapshot_json`
- `sink_capability`
- `exact_eligible`
- `started_at`
- `finished_at`

### Additions to `PipelineRun`

Suggested fields:

- `root_run_id`
- `latest_attempt_number`
- `effective_state`
- `effective_finished_at`

For initial runs, `root_run_id` equals `id`.

### Additions to `TaskRun`

The current `TaskRun` table can either evolve into the latest effective view or remain as a compatibility layer backed by `TaskRunAttempt`. The preferred design is:

- keep `TaskRunAttempt` as the immutable fact table
- derive current task status per node from the latest effective attempt
- preserve `TaskRun` only if the existing API requires a stable compatibility surface

## State Model

### Pipeline run states

- `queued`
- `running`
- `success`
- `failed`
- `canceled`
- `repairing`
- `partially_repaired`

`repairing` is the state of the root run while a repair attempt is active. `partially_repaired` indicates at least one failed repair attempt exists after the initial run.

### Attempt states

- `queued`
- `validating`
- `running`
- `success`
- `failed`
- `canceled`
- `blocked`

`blocked` is used when an exact repair request fails preflight validation.

### Task attempt states

- `pending`
- `queued`
- `running`
- `success`
- `failed`
- `skipped`
- `reused`
- `blocked`

`reused` marks a task that was intentionally not rerun because a prior attempt remains valid.

## Repair Planning

The repair planner is a control-plane service responsible for:

- computing the rerun set from the DAG and user selection
- validating exactness preconditions
- detecting invalid downstream reuse
- generating attempt-scoped write tokens
- persisting the plan before dispatch

### Planner inputs

- `run_id`
- requested `repair_mode`
- rerun selection
- `rerun_dependents` flag
- parameter overrides
- artifact policy
- input pin policy
- repair reason

### Planner outputs

- `attempt_id`
- resolved rerun task set
- reused task set
- validation warnings
- blocking errors
- attempt-scoped artifact snapshot

## Task Capability Model

Every executable node should declare a repair capability contract.

Suggested manifest fields:

- `replay_scope_type`: full, partition, range, ids, stream-window
- `input_replay_strategy`: snapshot, version, offset, none
- `sink_type`
- `sink_strategy`: append, overwrite, merge, transaction
- `idempotency_strategy`: none, key-based, transaction-id, merge-key
- `side_effect_class`: none, cataloged_sink, external_non_transactional
- `exact_supported`

This capability metadata is the basis for exact repair validation.

## API Changes

### New endpoints

- `GET /runs/{run_id}/attempts`
- `GET /runs/{run_id}/attempts/{attempt_id}`
- `GET /runs/{run_id}/matrix`
- `POST /runs/{run_id}/repairs`
- `POST /replays`

### Request: `POST /runs/{run_id}/repairs`

```json
{
  "repair_mode": "exact",
  "rerun_policy": "failed_and_dependents",
  "rerun_tasks": ["extract_orders", "load_orders"],
  "rerun_dependents": true,
  "parameter_overrides": {
    "date": "2026-03-15"
  },
  "artifact_policy": "pinned_original",
  "input_pin_policy": "reuse_original",
  "reason": "Fix null-handling bug in extract task"
}
```

### Response

```json
{
  "run_id": "run_123",
  "attempt_id": "att_002",
  "attempt_number": 2,
  "repair_mode": "exact",
  "state": "queued",
  "rerun_tasks": ["extract_orders", "transform_orders", "load_orders"],
  "reused_tasks": ["validate_reference_data"],
  "warnings": [],
  "blocking_errors": []
}
```

### Error model

Exact repair failures should return machine-readable codes such as:

- `run_not_terminal`
- `unsupported_sink`
- `non_replayable_input`
- `artifact_not_pinned`
- `invalid_downstream_reuse`
- `schema_incompatible`
- `conflicting_active_repair`
- `unsafe_external_side_effect`

### Compatibility changes

The existing endpoints remain but should evolve as follows:

- `GET /runs/{run_id}` returns root run plus latest effective state.
- `GET /runs/{run_id}/tasks` returns effective task status by node.
- `POST /tasks/{task_run_id}/retry` should eventually be deprecated in favor of run-scoped repair, because task-local retry does not provide safe downstream semantics.

## UI Changes

The frontend should add a run matrix that shows nodes as rows and attempts as columns.

Required views:

- root run summary
- attempt history
- task state matrix
- repair wizard
- exactness validation panel
- output impact preview

The repair wizard should require:

- repair reason
- mode selection
- rerun scope
- parameter override review
- validation acknowledgement

## Execution Rules

### Artifact pinning

Exact attempts must execute using the original submitted artifact snapshot unless the user explicitly requests a replay against a new artifact version. If a new artifact version is chosen, the operation is a replay, not a strict repair.

### Input pinning

Exact attempts must read the same logical inputs as the original run:

- batch tables by snapshot or table version
- files by manifest or object version
- events by offset range or checkpoint reference
- bounded replay by declared partition or key scope

### Sink writes

Each rerun task in exact mode must use a stable write identity:

- `root_run_id`
- `attempt_number`
- `node_id`
- optional `batch_sequence`

This identity is used by the sink adapter to enforce idempotency or transactional deduplication.

### Concurrency

Only one active exact repair may exist for a root run at a time. Best-effort repairs may also be serialized initially to reduce ambiguity and simplify operator behavior.

## Replay

Replay is a separate but related workflow.

### Replay contract

- A replay targets a declared data scope.
- A replay may be triggered without a failed root run.
- A replay recomputes the minimal impacted subgraph for the selected scope.
- Replay exactness depends on the same capability checks as exact repair.

### Replay request shape

```json
{
  "pipeline_id": "pl_daily_sales",
  "scope": {
    "type": "partition",
    "values": ["date=2026-03-15"]
  },
  "artifact_policy": "pinned_version",
  "artifact_version": 7,
  "repair_mode": "exact",
  "reason": "Backfill after source correction"
}
```

## MVP Scope

The MVP should be intentionally narrow.

- batch pipelines only
- DAGs executed by the existing control plane and mock runner abstraction
- exact repair only for supported table sinks
- no streaming checkpoint recovery
- no external side-effecting tasks in exact mode
- no automatic lineage-driven downstream expansion beyond the pipeline DAG

### MVP deliverables

- `PipelineRunAttempt` and `TaskRunAttempt` persistence
- run-attempt matrix API
- repair planner service
- exactness validator
- repair submission endpoint
- frontend repair wizard
- sink capability registry
- audit log entries for every repair

## Rollout Plan

### Phase 1

- introduce attempt entities and effective run view
- add repair API in best-effort mode
- add run matrix UI
- deprecate direct task retry in product guidance

### Phase 2

- add artifact snapshotting at run submission
- add exact repair validation
- support idempotent sink adapters for primary table outputs
- add audit and operator runbooks

### Phase 3

- add bounded replay APIs
- integrate lineage ingestion for downstream impact analysis
- support schema evolution guardrails and conflict categories

### Phase 4

- add streaming-specific exactness using checkpoints or savepoints
- add richer sink adapters for transactional messaging and merge-based outputs

## Operational Rules

- Every repair must require a human-readable reason.
- Every exact repair must emit validation results to the audit log.
- Output versions written by each task attempt must be stored and queryable.
- A repair should fail fast on schema or concurrency conflicts rather than partially continue.
- Runbooks must distinguish infra retry from semantic repair.

## Risks

- presenting best-effort operations as exact will damage operator trust
- exact repair without artifact pinning will produce mixed-version outcomes
- downstream reuse logic is easy to get wrong and can create silent inconsistency
- external side effects will remain the hardest boundary of the system
- streaming recovery will require a separate design, not a small extension of batch repair

## Open Questions

- Should `PipelineRun` remain the root-run record, or should root run and attempt be split into separate top-level tables immediately?
- Should selected-task repair allow rerunning a previously successful upstream node without automatically forcing all dependents?
- What is the initial sink support list for exact mode?
- How much lineage should be captured by the control plane versus execution engines?
- When a repair changes a published dataset version, what notification model should downstream consumers receive?

## Recommendation

Build this feature as `run repair with exactness modes`, not as a generic task retry enhancement.

The implementation sequence should be:

1. Introduce attempt-aware run metadata.
2. Add run-scoped repair APIs and matrix UX.
3. Enforce exactness through capability checks, artifact pinning, and sink adapters.
4. Add replay and lineage after the repair contract is stable.
