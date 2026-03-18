# Implementation Roadmap

> **Ref:** [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md)
> **Created:** 2026-02-16
> **Last updated:** 2026-03-18

---

## Completed Phases

All phases below are complete. The full historical checklists are preserved in [docs/archive/ROADMAP-full.md](archive/ROADMAP-full.md).

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project Scaffolding | ✅ Complete |
| 1 | Vanilla HTML Baseline (reference implementation) | ✅ Complete |
| 2 | Vite-Based Apps — React, Vue, Svelte | ✅ Complete |
| 3 | Angular App | ✅ Complete |
| 4 | Next.js SSR App | ✅ Complete |
| 5 | Web Components — Lit App | ✅ Complete |
| 6 | HTMX App | ⏸️ Deferred from v0.1 |
| 7 | Final Validation & Documentation | ✅ Complete |
| 8 | Framework Library (By, handlers, group, typed wrappers) | ✅ Complete |
| 9 | Framework Simplification Sprint (112 issues closed) | ✅ Complete |
| 9.5 | Pre-Phase 10 Prerequisites (SelectAdapter, clickInContainer) | ✅ Complete |
| 10 | Make Apps Idiomatic (component libraries across all 7 apps) | ✅ Complete |
| 10.8 | Post-Review Stabilization (8 P0 fixes, 48 unit tests added) | ✅ Complete |
| 11 | Runtime Crawler (group discovery, manifest, CLI, Shadow DOM) | ✅ Complete |
| 12 | Page Object Emitter (codegen, diff mode, templates, CLI) | ✅ Complete |
| 13 | Validation — Generated vs Hand-Written (structural + functional) | ✅ Complete |
| — | Network Settle Middleware (auto-wait for in-flight HTTP) | ✅ Complete |

**Current test count:** 2,088 tests (924 framework integration + 219 unit + 868 crawler integration + 77 crawler unit), all passing.

---

## Tips

- **Use the vanilla-html app as your behavioral reference.** When in doubt about how a contract element should *behave*, check the vanilla baseline. Don't copy its DOM — the point is different DOM, same behavior.
- **The behavioral contract is the only shared contract.** Outcomes (filter results, sort order, toast text) must match across apps. DOM structure, tag names, and CSS classes will not match — and that's the point.
- **The crawler finds groups, the framework finds elements.** Don't try to classify individual controls in the crawler — `group.write()` handles that at runtime.
- **The existing 2,088 tests are your safety net.** After every change, run the integration tests. If they break, the framework needs a new handler/detect rule — that's the feedback loop.
- **Commit after each phase.** Each phase is a stable checkpoint.

---

*This roadmap is a companion to [REQUIREMENTS.md](../docs/REQUIREMENTS.md). Update both as decisions are made.*
