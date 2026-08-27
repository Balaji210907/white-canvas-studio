# AERO-TWIN AI V2 — Hardening to a real engineering prototype

## Audit of what exists today

- 12 pages under `src/routes/` (Command Center, Telemetry, Twin, Health, Diagnosis, Mission, History, Simulation, Validation, Models, System, Settings) — good UI, keep all of it.
- `src/lib/sim/engine.ts` (593 lines): one monolithic `TwinSimulator` that both *generates* engine behaviour and *judges* it. Simulator and Digital Twin are not separated.
- `src/lib/sim/store.tsx`: a `setInterval` in React memory. All state is lost on reload; every page recomputes engineering values inline (health decomposition, RUL slope, subsystem scores live inside `health.tsx`, pipeline stage logic inside `system.tsx`).
- No backend, no database, no realtime transport, no persistence, no tests, no ground truth, no provenance beyond a visual tag.

Main problems to fix: no canonical telemetry contract, engineering math inside React components, duplicated health/risk formulas across pages, no traceability, no validation against ground truth, no hardware-adapter seam.

## Delivery approach

This is far too large for one pass. I propose shipping it in five reviewable phases, each leaving the app working. Phase 1 is the one I would start now.

### Phase 1 — Foundation (canonical contract + backend core + persistence)
- Enable Lovable Cloud (database + server functions).
- `src/lib/telemetry/frame.ts`: the canonical `TelemetryFrame` (ids, sequence, UTC timestamp, `source_type` SIMULATED/SYNTHETIC/REPLAY/HIL/TEST_RIG/REAL_ENGINE, per-channel `{ value, unit, status, quality }` with VALID/MISSING/STALE/INVALID/DEGRADED/UNAVAILABLE), plus Zod schema.
- `src/lib/config/registry.ts`: every engineering constant (thresholds, twin coefficients, sensor specs, units, ranges) in one versioned registry — removes the magic numbers now scattered in pages.
- Adapter interface + `SimulatorAdapter` and stub `Replay/Serial/CAN/DAQ/ECU` adapters reporting `NOT_CONNECTED`.
- Split `engine.ts` into `simulator/` (virtual actual engine → frames) and `twin/` (frame → expected state). They stop sharing internals.
- Database tables: engines, vehicles, missions, sensors, sensor_configurations, telemetry, telemetry_quality, sensor_health, operating_states, twin_predictions, residuals, anomalies, fault_diagnoses, component_health, health_history, rul_predictions, mission_risk, alerts, recommendations, models/model_versions/model_metrics, validation_runs, test_scenarios, configuration_versions, system_events, audit_log. RLS + grants on all.

### Phase 2 — Pipeline services
Server-side pipeline modules with defined in/out: DataQuality → SensorHealth → OperatingState → PhysicsTwin → Residual → Anomaly → FaultDiagnosis → ComponentHealth → EngineHealth → Degradation → RUL (returns `NOT_AVAILABLE` with reason until a validated model exists) → MissionRisk (named *Mission Risk Index*, never "probability of failure") → Recommendation → Alerts. One source of truth; pages become presentation only.

### Phase 3 — Realtime + observability
Streaming transport for processed frames, connection state, last-packet time, per-stage latency, freshness/staleness handling (`DATA STALE`, reduced confidence, `MODEL UNAVAILABLE`), Pipeline Monitor, and **Trace Mode** (raw frame → quality → sensor health → state → twin → residual → AI → diagnosis → health → risk for any selected result).

### Phase 4 — Ground truth, validation, replay
Synthetic scenario generator with known ground truth (10 reproducible scenarios), Replay engine (play/pause/seek/0.25x–5x) through the *same* pipeline, Validation Center split by evidence stage (Synthetic / Replay / HIL / Test-Rig / Real Engine — each `NO DATA AVAILABLE` until evidence exists), real metrics (MAE/RMSE/bias; precision/recall/F1/confusion; RUL interval coverage), model registry with DEVELOPMENT/SHADOW/ACTIVE/RETIRED.

### Phase 5 — Hardware readiness, new pages, tests, docs
New pages: Data Sources, Hardware, Replay, Test Runs, Trace. Config-driven CAN signal mapping (never faked as connected). Vitest suites for validation, twin, residuals, sensor health, diagnosis, health, mission risk, replay + one end-to-end pipeline test. Docs: ARCHITECTURE, DATA_MODEL, TELEMETRY_SCHEMA, DIGITAL_TWIN, AI_PIPELINE, VALIDATION, HARDWARE_INTEGRATION, REPLAY, CONFIGURATION, TESTING, each marking IMPLEMENTED / SIMULATED / NOT CONNECTED / NOT YET VALIDATED.

## Honest constraints

- AI anomaly detection will be trainable statistical/Isolation-Forest-class methods running server-side — no deep learning theatre, no fabricated metrics.
- RUL, HIL, test-rig and real-engine validation will exist as pipelines and stay `NOT AVAILABLE` until you supply data. That is by design and I will not fill them with numbers.
- Everything remains a decision-support prototype, labelled SIMULATED unless real data is imported.
