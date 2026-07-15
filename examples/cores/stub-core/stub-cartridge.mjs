// A sample compiled cartridge for the stub core (examples/cores/stub-core/core.mjs).
// Format 'example/stub-cartridge@1'; identity is a digest of the frozen
// document, matching how core.mjs computes identity for cartridges compiled
// from raw authoring documents.
import {digest, deepFreeze} from '../../../src/index.mjs';

const CARTRIDGE_FORMAT = 'example/stub-cartridge@1';
const document = deepFreeze({length: 3});
const identity = digest({format: CARTRIDGE_FORMAT, document});

/** Compiled cartridge consumed directly by the stub core / CLI / demo script. */
const cartridge = deepFreeze({format: CARTRIDGE_FORMAT, identity, document});
export default cartridge;
