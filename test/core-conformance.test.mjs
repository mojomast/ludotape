import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runCoreConformance} from './core-conformance.mjs';
import {createCore as createTemplateCore} from '../src/cores/custom-core-template/core.mjs';
import {createCore as createStubCore} from '../examples/cores/stub-core/core.mjs';
import stubCartridge from '../examples/cores/stub-core/stub-cartridge.mjs';

function failures(report) {
  return JSON.stringify(report.results.filter(r => !r.ok), null, 2);
}

test('custom-core-template passes its own conformance suite', async () => {
  const cartridgeSource = {document: {start: 0, target: 3, step: 1}};
  const report = await runCoreConformance(createTemplateCore, {cartridgeSource, seed: 1});
  assert.equal(report.ok, true, failures(report));
  assert.equal(report.failed, 0);
});

test('example stub core passes its own conformance suite', async () => {
  const report = await runCoreConformance(createStubCore, {cartridgeSource: stubCartridge, seed: 2});
  assert.equal(report.ok, true, failures(report));
  assert.equal(report.failed, 0);
});

test('conformance harness reports ok:false for a core missing a required method', async () => {
  const broken = {
    metadata: {
      format: 'ludotape/core@1', id: 'broken/core', version: '0.0.1', name: 'Broken Core',
      capabilities: {replay: false, rewind: false, solve: false, scenarios: false},
      cartridgeFormats: ['broken/cartridge@1']
    },
    loadCartridge: source => source,
    createRun: () => ({turn: 0}),
    availability: () => [],
    project: () => ({})
    // dispatch intentionally missing
  };
  const report = await runCoreConformance(broken, {cartridgeSource: {}});
  assert.equal(report.ok, false);
  assert.ok(report.failed >= 1);
  assert.ok(report.results.some(r => !r.ok && /dispatch/.test(r.message)));
});

test('conformance harness reports ok:false when cartridgeSource is not provided', async () => {
  const report = await runCoreConformance(createStubCore, {});
  assert.equal(report.ok, false);
});

const jsTsCorePath = fileURLToPath(new URL('../src/cores/js-ts-core/core.mjs', import.meta.url));
test('js-ts-core passes the conformance suite with the basic-counter example', async t => {
  if (!existsSync(jsTsCorePath)) { t.skip('src/cores/js-ts-core/core.mjs is not present yet'); return; }
  const {createCore} = await import('../src/cores/js-ts-core/core.mjs');
  const cartridge = (await import('../examples/basic-counter.mjs')).default;
  const report = await runCoreConformance(createCore, {cartridgeSource: cartridge, seed: 0});
  assert.equal(report.ok, true, failures(report));
  assert.equal(report.failed, 0);
});
