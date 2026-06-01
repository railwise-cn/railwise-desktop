# Railwise Engineering Readiness Checkpoint

This checkpoint records the bundled Railwise engineering workspace after the first migration pass.

## Ready State

- Desktop first launch resolves the bundled `railwise/` workspace when no saved workspace is available.
- `railwise/.mcp.json` mounts the `survey` MCP server through `node ./survey-mcp/dist/index.js`.
- Root `npm run build` builds `railwise/survey-mcp` before packaging desktop resources.
- `scripts/postinstall.mjs` installs `railwise/survey-mcp` dependencies during checkout setup.
- `.reasonix/skills/` contains the Railwise subagents and workflow skills needed for engineering use.
- `railwise/REASONIX.md` defines the Chief SOP: WBS planning, qa-inspector first-pass checks, and qa-reviewer final gate.
- Desktop now exposes a Railwise readiness page in the right Context Panel and a status-bar summary (`ok / warn / fail`).
- Desktop can initialize a new Railwise project with `.mcp.json`, `REASONIX.md`, project skills, SOP, monitoring CSV, CPIII, shield guidance, and inclinometer fixtures.

## Verification Gates

- `npm run build:survey`
- `npx vitest run tests/railwise-workspace.test.ts tests/railwise-sop.test.ts tests/survey-mcp-tools.test.ts`
- `npx vitest run tests/railwise-readiness.test.ts tests/railwise-e2e-sample.test.ts`
- `npx vitest run tests/railwise-project-init.test.ts tests/desktop-railwise-readiness.test.tsx`
- `npm run verify`

## Operating Notes

- Numerical engineering work must go through `survey_*` MCP tools; the agent must not hand-calculate adjustment, closure, or alert-gate results.
- External delivery work must end with `run_skill qa-reviewer`.
- Raw field data must pass through `run_skill qa-inspector` before `run_skill data-analyst`.
- The sample packet at `railwise/examples/metro-protection/` is the reference smoke scenario for future changes.
- Use `/railwise` to open readiness, `/railwise init` or the sidebar project button to create a fresh project packet.
