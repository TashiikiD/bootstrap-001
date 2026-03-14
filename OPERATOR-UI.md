# AIES Operator UI

## Purpose

`operator-ui/` is the local-first transparency surface for `AIES v2`.

It provides two connected views:

- a live operator app for the active Pi session
- an observatory/history view for cross-cycle state, artifacts, and debt

This UI is intended to replace the TUI as the primary transparency surface. It does not replace the Pi runtime; it sits on top of the existing AIES-on-Pi stack.

## Structure

- `operator-ui/server/index.ts`
  - local backend on `http://127.0.0.1:4320`
  - reads Pi session entries and AIES durable files
  - exposes read-heavy JSON endpoints and a small set of mutation endpoints
- `operator-ui/src/main.ts`
  - live operator frontend on top of the local backend
  - stage panels, transcript, controls, unified timeline, observatory view
- `.aies-runtime/operator-ui/controls.json`
  - local operator preferences and selected session
- `.aies-runtime/operator-ui/actions.json`
  - local operator action queue / manual notes

## Run

Install/build/run from the project root:

- install dependencies:
  - `.\run-operator-ui.ps1 -Mode install`
- run backend only:
  - `.\run-operator-ui.ps1 -Mode backend`
- run frontend dev server only:
  - `.\run-operator-ui.ps1 -Mode frontend`
- run both for local development:
  - `.\run-operator-ui.ps1 -Mode dev`
- build frontend:
  - `.\run-operator-ui.ps1 -Mode build`

Frontend dev URL:

- `http://127.0.0.1:4321`

Backend URL:

- `http://127.0.0.1:4320`

## Exposed API

Read endpoints:

- `GET /api/health`
- `GET /api/state`
- `GET /api/observatory`
- `GET /api/timeline`
- `GET /api/actions`

Mutation endpoints:

- `POST /api/session/select`
- `POST /api/prompt`
- `POST /api/controls/trigger`
- `POST /api/controls/heartbeat`
- `POST /api/controls/provider-model`
- `POST /api/controls/policy`
- `POST /api/controls/verification/mode`
- `POST /api/controls/verification/record`
- `POST /api/actions`
- `POST /api/actions/:id/resolve`

## Scope Notes

- Heartbeat interval/continuous controls are surfaced now for transparency and future scheduling work. The current heartbeat extension remains observational.
- Provider/model controls affect prompts sent through the operator app and are logged as operator overrides.
- Policy and verification controls also call through to the existing slash-command surfaces when a session is active.
- Session-affecting Pi mutations are serialized and time-bounded. On timeout/failure, the operator app keeps the local override, logs an open follow-up item, and returns control instead of hanging indefinitely.
- The backend remains local/private-first and reads from canonical AIES sources:
  - Pi session entries
  - `memory/`
  - `openspec/`

## Known Limitations

- The frontend currently polls the backend; it does not use websockets yet.
- Some same-session Pi CLI slash-command runs still append prior assistant text in output. This is a runtime quirk outside the operator UI itself.
- The UI is intentionally summary-first with drill-down and raw payload inspection. It is not trying to mirror every internal Pi/TUI surface.
