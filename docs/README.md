# Ludotape documentation

- [Getting started](getting-started.md) — create, validate, solve, run, project, and replay a basic game.
- [Cartridge authoring toolkit](cartridge-authoring-toolkit.md) — simulate action scripts, declare exact scenarios, run bounded checks, and use CLI `check`/`test`.
- [API reference](api-reference.md) — package exports, signatures, limits, and callback RNG access.
- [Game author guide](game-author-guide.md) — callback, action, rendering, accessibility, testing, and determinism practices.
- [Determinism contract](determinism-contract.md) — supported values and sources of nondeterminism.
- [Replay format](replay-format.md) — exact replay fields and integrity semantics.
- [Renderer adapters](renderer-adapters.md) — projections and snapshot-only adapter metadata.
- [Editor and storage](editor-and-storage.md) — drafts and repository assumptions.
- [Benchmark methodology](benchmark-methodology.md) — what `npm run benchmark` measures.
- [Provenance](provenance.md) — project origin and artifact notes.

## Devkit and cores

- [Devkit and cores overview](devkit-overview.md) — the SDK, the pluggable core abstraction, package subpath map, and architecture.
- [Core authoring guide](core-authoring-guide.md) — scaffold, implement, validate, and conformance-check a custom core.
- [JS/TS core reference](js-ts-core-reference.md) — full API of the built-in core and its re-exported author-facing surface.
- [Custom core reference](custom-core-reference.md) — `ICore`, metadata/manifest schemas, loader/registry, and conformance API.
- [CLI reference](cli-reference.md) — every command including the `core` group and the devkit CLIs.
- [SDK publishing guide](sdk-publishing-guide.md) — package and publish a core as an npm module.
- [Core specification](../CORE_SPEC.md) — normative `ICore`, manifest, loader, conformance, and versioning policy.
- [Specification](../SPEC.md) — normative core behavior.
- [Architecture](../ARCHITECTURE.md) — module boundaries and trust model.
- [Security](../SECURITY.md), [support](../SUPPORT.md), [contributing](../CONTRIBUTING.md), [roadmap](../ROADMAP.md), and [changelog](../CHANGELOG.md).
