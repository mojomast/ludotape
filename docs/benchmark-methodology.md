# Benchmark methodology

`npm run benchmark` measures 5,000 Warehouse dispatch cycles, 5,000 small-object SHA-256 digests, and one bounded Warehouse solve in a single warmed Node process. It prints JSON containing runtime, platform, elapsed milliseconds, throughput, and solve nodes. Redirect stdout to a caller-owned file when retaining a result; the benchmark never writes into the source or installed package.

Results are descriptive snapshots, not statistically rigorous comparisons. CPU load, JIT state, power policy, Node version, and hardware affect them. Do not infer browser or cross-runtime performance. For comparisons, pin hardware/runtime, run many independent processes, retain raw outputs, and report distributions.
