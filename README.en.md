# Stretching Voice-Broadcast App — Real Engineering Notes

[简体中文](./README.md) | English

> Read this first: this README documents only the governance scaffolding — the ORCA new-project template package reproduced below. It is **not** a description of completed app features. The real business code of this project lives in `App.tsx`, `src/`, `app.json`, and `eas.json`; the development baseline SDD-V1.0 is in `docs/plan/`; current progress and open (deferred) items are recorded in `docs/handoff/HANDOFF.md`.

## ORCA new-project template package

### Purpose

Used to initialize new projects. This package only provides ORCA's run entry points and templates; it contains no business code from any older project.

### Usage: placing the files in the project root

```text
AGENTS.md                 → the root AGENTS.md of the ORCA distribution
USER_MODEL_OVERRIDE.md    → a symlink pointing to USER_MODEL_OVERRIDE.md at the ORCA distribution root (do not copy the real file; editing the master version syncs all projects; if the link breaks across machines, copy the real file and record it in HANDOFF)
docs/roles/               → docs/roles/ of the ORCA distribution
docs/pm/                  → docs/pm/ of the ORCA distribution
docs/handoff/             → docs/handoff/ of the ORCA distribution
docs/model/               → docs/model/ of the ORCA distribution
docs/qa/                  → docs/qa/ of the ORCA distribution
docs/review/              → docs/review/ of the ORCA distribution
docs/sop/                 → docs/sop/ of the ORCA distribution (docker.md, supabase.md, sqlite.md, referenced without version numbers)
经验一句话.md             → the root 经验一句话.md ("one-line lesson") of the ORCA distribution
GOVERNANCE_VERSION                   → project root (the package already includes the original text)
外部开发者提示词.md / 编排者提示词.md → project root (kept at their original location inside the package)
Orca 通用编排者持续推进协议.md / Orca 编排治理监督者提示词.md → project docs/prompts/ (AGENTS and the orchestrator prompt reference them at this path; do not leave them in the root)
归位表.template.md                   → project docs/templates/ (original location inside the package)
docs/model/DISPATCH-LOG.jsonl        → project docs/model/ (the package ships a sample line; delete it before the first dispatch)
docs/pm/PRODUCT_PLAN.template.md     → project docs/pm/ (Phase 1 only, the Readiness canon)
docs/review/RESEARCH_REVIEW.template.md → project docs/review/ (Phase 1 only; the internal ID product-reviewer stays unchanged; newly added)
scripts/orchestration/               → project scripts/orchestration/ (optional: deploy the L3 watchdog only when the Orca terminal / external channel orchestrates long tasks; see its README for the deployment method)
```

This package already contains the verbatim text of directly usable files; after copying into a new project it does not depend on paths in the source repository. Project run records (HANDOFF, the task ledger, QA, and Review) must live locally in the project.

### What must not be copied

- The Git history of the ORCA distribution;
- HANDOFF, BUG, Review, or real data from other projects;
- Archived files of older versions.

### After initialization

1. Confirm `AGENTS.md` and `USER_MODEL_OVERRIDE.md` have been placed in the project root.
2. Create the project-local `docs/model/TASK-MODEL-LOG.jsonl`.
3. Create the project's `docs/handoff/HANDOFF.md`.
4. Only then start the first task.
