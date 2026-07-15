import test from 'node:test';
import assert from 'node:assert/strict';
import {createDraft, restoreDraft} from '../src/editor.mjs';

test('createDraft supports initial state, replace, and update', () => {
  const draft = createDraft({count: 1});
  assert.deepEqual(draft.document, {count: 1});
  assert.equal(draft.revision, 0);
  assert.deepEqual(draft.replace({count: 2}), {count: 2});
  assert.equal(draft.revision, 1);
  draft.update(document => {
    document.count++;
    return document;
  });
  assert.deepEqual(draft.document, {count: 3});
  assert.equal(draft.revision, 2);
});

test('undo and redo traverse draft edits', () => {
  const draft = createDraft({value: 'first'});
  draft.replace({value: 'second'});
  draft.replace({value: 'third'});
  assert.equal(draft.undo(), true);
  assert.deepEqual(draft.document, {value: 'second'});
  assert.deepEqual(draft.redo(), {value: 'third'});
  assert.deepEqual(draft.document, {value: 'third'});
  assert.equal(draft.redo(), false);
  draft.undo();
  draft.replace({value: 'branch'});
  assert.equal(draft.redo(), false);
});

test('snapshot round-trips through restoreDraft', () => {
  const draft = createDraft({level: {name: 'one'}});
  draft.replace({level: {name: 'two'}});
  const snapshot = draft.snapshot();
  const restored = restoreDraft(snapshot);
  assert.deepEqual(restored.document, snapshot.document);
  assert.equal(restored.revision, snapshot.revision);
  assert.equal(restored.dirty, false);
  assert.equal(restored.historyLength, 0);
  assert.throws(() => restoreDraft({...snapshot, digest: '0'.repeat(64)}), error => error.code === 'E_EDITOR');
  assert.throws(() => restoreDraft({...snapshot, format: 'other'}), error => error.code === 'E_EDITOR');
});

test('dirty and markSaved track unsaved history', () => {
  const draft = createDraft({saved: true});
  assert.equal(draft.dirty, false);
  draft.replace({saved: false});
  assert.equal(draft.dirty, true);
  draft.markSaved();
  assert.equal(draft.dirty, false);
});

test('historyLength and redoLength expose stack sizes only', () => {
  const draft = createDraft({step: 0});
  assert.equal(draft.historyLength, 0);
  assert.equal(draft.redoLength, 0);
  draft.replace({step: 1});
  draft.replace({step: 2});
  assert.equal(draft.historyLength, 2);
  draft.undo();
  assert.equal(draft.historyLength, 1);
  assert.equal(draft.redoLength, 1);
  draft.redo();
  assert.equal(draft.historyLength, 2);
  assert.equal(draft.redoLength, 0);
});
