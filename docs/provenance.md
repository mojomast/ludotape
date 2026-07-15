# Provenance

This repository was created as an original implementation for the Ludotape specification. It uses no runtime or development packages and contains no copied third-party source. The synchronous SHA-256 implementation follows the public FIPS 180-4 algorithm; its standard empty and `abc` vectors are tested. Example game designs use familiar warehouse-puzzle and card-comparison mechanics without third-party assets.

Generated outputs are identified by location (`dist/`, `bench/results.json`) and excluded from version control. Git history and test/benchmark output provide local build provenance; no remote provenance or reproducible-build claim is made.
