# CLI reference

Complete reference for every Ludotape command-line entry point: the core CLI (`bin/ludotape.mjs`) with its existing commands and the `core` command group, and the devkit CLIs (`ludotape-create`, `ludotape-create-core`, `validate-core`). Argument lists, defaults, ranges, output shapes, and exit codes are drawn directly from the implementation.

## Overview

Three executables:

| Executable | Source | Purpose |
| --- | --- | --- |
| `ludotape` | `bin/ludotape.mjs` | Validate, check, test, verify, solve, benchmark, serve; and the `core` group. |
| `ludotape-create` | `devkit/create-game.mjs` | Scaffold a game module and scenarios file. |
| `ludotape-create-core` | `devkit/create-core.mjs` | Scaffold a custom core from the template. |
| `validate-core` | `devkit/validate-core.mjs` | Statically validate a core directory (run as `node devkit/validate-core.mjs`). |

In a source checkout, invoke the core CLI as `node bin/ludotape.mjs <command>`. As an installed package, `ludotape <command>`; the `ludotape-create` and `ludotape-create-core` bins are installed on `PATH` (or run via `npx`).

## Prerequisites

- Node.js 20+. Zero dependencies.
- Cartridge modules export the compiled cartridge as `default` or a named `cartridge`. Scenario modules export `default` or a named `scenarios`.
- Numeric arguments use strict decimal integer syntax (`/^[-]?\d+$/`). Seeds are signed 32-bit integers.

## Conventions

- Commands print `JSON.stringify(result, null, 2)` on stdout, except `serve` and command-level failures.
- Command, import, and argument failures print `CODE: message` on stderr and set a non-zero exit code.
- Default failure exit code is `1`; `solve` uses `2` for an unsolved/bounded result.

## `ludotape` commands

### `validate`

```text
ludotape validate cartridge.mjs [seed]
```

Imports the cartridge, creates its initial state, and evaluates initial legal actions. Intentionally shallow — it does not execute every transition or projection.

| Argument | Range | Default |
| --- | --- | --- |
| `cartridge.mjs` | required path | — |
| `seed` | `-2147483648 .. 2147483647` | `0` |

Output: `{ok: true, identity, initial, actions}` where `actions` is the count of initial legal actions. Exit: `0` on success; `1` on argument/import/runtime failure.

```sh
node bin/ludotape.mjs validate examples/basic-counter.mjs
node bin/ludotape.mjs validate examples/basic-counter.mjs 7
```

### `check`

```text
ludotape check cartridge.mjs [seed [depth [paths]]]
```

Bounded breadth-first authoring exploration (`checkCartridge`). `maxActionsPerState` is fixed at `100`.

| Argument | Range | Default |
| --- | --- | --- |
| `cartridge.mjs` | required path | — |
| `seed` | `-2147483648 .. 2147483647` | `0` |
| `depth` | `0 .. 100` | `2` |
| `paths` | `0 .. 100000` (0 reaches the authoring API and is rejected there) | `100` |

Output: the full `checkCartridge` report. Exit: `0` with zero error diagnostics (warnings allowed); `1` for report errors or command/import/argument failure.

```sh
node bin/ludotape.mjs check examples/basic-counter.mjs 0 2 100
```

### `test`

```text
ludotape test cartridge.mjs scenarios.mjs
```

Runs exact declared scenarios (`runScenarios`). Exactly two arguments.

Output: the aggregate scenario report. Exit: `0` when every scenario passes; `1` for scenario, command, import, or argument failure.

```sh
node bin/ludotape.mjs test examples/basic-counter.mjs examples/basic-counter.scenarios.mjs
```

### `verify`

```text
ludotape verify cartridge.mjs replay.json
```

Verifies a replay JSON file against the cartridge (`verifyReplay`). Exactly two arguments. The replay file MUST NOT exceed 2 MiB (`E_REPLAY_LIMIT`).

Output: the verification result with `run` omitted. Exit: `0` when `ok`; `1` on failed verification or command/import/argument failure.

```sh
node bin/ludotape.mjs verify examples/basic-counter.mjs my-replay.json
```

### `solve`

```text
ludotape solve cartridge.mjs [seed [depth [nodes]]]
```

Bounded FIFO BFS (`solve`).

| Argument | Range | Default |
| --- | --- | --- |
| `cartridge.mjs` | required path | — |
| `seed` | `-2147483648 .. 2147483647` | `0` |
| `depth` | `0 .. 1000` | `20` |
| `nodes` | `0 .. 1000000` | `10000` |

Output: the solve result `{status, actions, ...}`. Exit: `0` when `status === 'solved'`; `2` when `unsolved` or `bounded`; `1` on command/import/argument failure.

```sh
node bin/ludotape.mjs solve examples/basic-counter.mjs 0 3 100
```

### `benchmark`

```text
ludotape benchmark
```

Runs the bundled benchmark (`bench/benchmark.mjs`). Takes no arguments. Exit: `0` on success; `1` on failure.

### `serve`

```text
ludotape serve [port [host]]
```

Starts the loopback-only static server for the built `dist/` (build first with `npm run build`). It is for trusted local development, not deployment.

| Argument | Range | Default |
| --- | --- | --- |
| `port` | `0 .. 65535` | `8080` |
| `host` | non-empty string | `127.0.0.1` |

Prints a startup line and stays running; it exits on process/server failure rather than a result report.

```sh
npm run build
node bin/ludotape.mjs serve
# open http://127.0.0.1:8080/studio/
```

## `core` command group

Added by the core layer, preserving existing style and exit codes. Discovery defaults to the default registry plus `discoverCores(['src/cores', 'examples/cores'])` relative to the package root.

### `core list`

```text
ludotape core list
```

Prints the metadata of discovered cores (built-in default registry plus discovered directories). Output: `{registered, discovered: {cores, diagnostics}}`, where `registered` is `defaultRegistry.list()` and `discovered.cores`/`discovered.diagnostics` come from `discoverCores`. Exit: `0` on success; `1` on failure.

```sh
node bin/ludotape.mjs core list
```

### `core validate`

```text
ludotape core validate <coreDir>
```

Statically validates a core directory using the loader (`loadCoreFromManifest`/`validateCoreShape`) — the same checks the devkit `validate-core` performs, without running gameplay. Output: a JSON report. Exit: `0` when valid; `1` on failure.

```sh
node bin/ludotape.mjs core validate examples/cores/stub-core
```

### `core conformance`

```text
ludotape core conformance <coreDir> <cartridge.mjs> [seed]
```

Runs the conformance harness (`runCoreConformance`) against the core, with a required cartridge module and an optional seed.

| Argument | Range | Default |
| --- | --- | --- |
| `<coreDir>` | required path | — |
| `cartridge.mjs` | required path | — |
| `seed` | signed 32-bit integer | `0` |

Output: the conformance result `{ok, passed, failed, results}`. Exit: `0` when `ok`; `1` when a check fails or on command/import/argument failure.

```sh
node bin/ludotape.mjs core conformance examples/cores/stub-core examples/cores/stub-core/stub-cartridge.mjs 0
```

## Devkit CLIs

### `ludotape-create`

```text
ludotape-create [--name <name>] [--id <id>] [--dir <dir>] [--title <title>] [--yes | -y] [--force] [--help | -h]
node devkit/create-game.mjs [--name <name>] [--id <id>] [--dir <dir>] [--title <title>] [--yes | -y] [--force] [--help | -h]
```

Interactive game scaffolder (built on `node:readline/promises`, zero dependencies). Generates a game module and a scenarios file from templates. Prompts for anything unset unless `--yes`/`-y` is given, in which case defaults apply: `--name` defaults to `my-game`, `--id` to `example/<name>`, `--dir` to `.`, and `--title` to `<name>`. `--force` overwrites existing files; `--help`/`-h` prints usage and exits. Deterministic output (no timestamps). Exit: `0` on success; non-zero on failure.

```sh
node devkit/create-game.mjs --name my-game --dir examples/my-game --yes
```

### `ludotape-create-core`

```text
ludotape-create-core [--id <scope/name>] [--name <name>] [--dir <dir>] [--yes | -y] [--force] [--help | -h]
node devkit/create-core.mjs [--id <scope/name>] [--name <name>] [--dir <dir>] [--yes | -y] [--force] [--help | -h]
```

Custom-core scaffolder. Generates a working document-driven-counter `ICore` implementation instantiated with the chosen id and name. Prompts for anything unset unless `--yes`/`-y` is given, in which case defaults apply: `--id` defaults to `example/my-core`, `--name` to `<id>`, and `--dir` to `./my-core`. `--force` overwrites existing files; `--help`/`-h` prints usage and exits. Exit: `0` on success; non-zero on failure.

```sh
node devkit/create-core.mjs --id example/my-core --name "My Core" --dir examples/cores/my-core --yes
```

### `validate-core`

```text
node devkit/validate-core.mjs <coreDirOrManifestPath>
```

Static core validation: manifest well-formedness, entry import, `createCore` export, metadata↔manifest match, and `validateCoreShape` — without running gameplay. Also exported programmatically as `validateCore(dirOrManifestPath)` from `devkit/index.mjs`. Prints a JSON report to stdout. Exit: `0` when valid; `1` on failure.

```sh
node devkit/validate-core.mjs examples/cores/my-core
```

## Exit codes summary

| Code | Meaning |
| --- | --- |
| `0` | Success: `validate`, `verify`, `test`, `benchmark`; `check` with zero errors; solved `solve`; passing `core validate`/`core conformance`; successful scaffolding/validation. |
| `1` | Argument/import/runtime failure; failed replay verification; failed scenarios; `check` with error diagnostics; failed `core` command or devkit validation. |
| `2` | `solve` returned `unsolved` or `bounded`. |

## Troubleshooting

| Code | Command(s) | Cause | Fix |
| --- | --- | --- | --- |
| `E_CLI_ARGUMENT` | all | Missing/extra argument, or a numeric argument out of range or not strict-decimal. | Match the synopsis; use decimal integers within the documented ranges. |
| `E_CLI_CARTRIDGE_EXPORT` | validate/check/test/verify/solve/core | The cartridge module exports neither `default` nor `cartridge`. | Export the compiled cartridge as `default` or named `cartridge`. |
| `E_CLI_SCENARIOS_EXPORT` | test | The scenarios module exports neither `default` nor `scenarios`. | Export the scenarios array as `default` or named `scenarios`. |
| `E_REPLAY_LIMIT` | verify | Replay file exceeds 2 MiB, or its contents exceed replay validation limits. | Shrink the replay or split the run. |
| `E_CORE_MANIFEST` / `E_CORE_ENTRY` / `E_CORE_SHAPE` | core validate/conformance, validate-core | The core directory's manifest, entry, or shape is invalid. | See the [custom core reference](custom-core-reference.md#troubleshooting) and [core authoring guide](core-authoring-guide.md#troubleshooting). |
| `E_CORE_CARTRIDGE` | core conformance | The provided cartridge's `format` is not in the core's `cartridgeFormats`. | Pass a cartridge the core supports, or add the format. |

Command, import, and argument failures print `CODE: message` on stderr; runtime results otherwise print JSON on stdout.

## See also

- [API reference](api-reference.md) — CLI syntax overview alongside the programmatic API.
- [Cartridge authoring toolkit](cartridge-authoring-toolkit.md) — `check`/`test` in depth.
- [Core authoring guide](core-authoring-guide.md) and [Custom core reference](custom-core-reference.md) — the `core` commands and devkit CLIs in context.
- [Getting started](getting-started.md) — first use of `validate`/`solve`/`serve`.
