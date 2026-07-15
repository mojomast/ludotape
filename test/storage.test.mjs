import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryRepository, createStorageRepository} from '../src/storage.mjs';

function createStorageMock() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(String(key)) ? data.get(String(key)) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    clear() { data.clear(); }
  };
}

async function exerciseRepository(repository) {
  assert.equal(await repository.put('game/one', {score: 1}), 'game/one');
  await repository.put('game/two', {score: 2});
  await repository.put('replay/one', [1, 2]);
  const value = await repository.get('game/one');
  assert.deepEqual(value, {score: 1});
  value.score = 99;
  assert.deepEqual(await repository.get('game/one'), {score: 1});
  assert.deepEqual(await repository.list('game/'), ['game/one', 'game/two']);
  assert.equal(await repository.delete('game/one'), true);
  assert.equal(await repository.delete('game/one'), false);
  assert.equal(await repository.get('game/one'), null);
  await repository.clear();
  assert.deepEqual(await repository.list(), []);
}

test('createMemoryRepository supports the repository lifecycle', async () => {
  await exerciseRepository(createMemoryRepository());
});

test('createStorageRepository supports lifecycle and namespace isolation', async () => {
  const storage = createStorageMock();
  storage.setItem('foreign:key', 'leave me');
  const first = createStorageRepository(storage, {namespace: 'one:'});
  const second = createStorageRepository(storage, {namespace: 'two:'});
  await first.put('shared', {owner: 1});
  await second.put('shared', {owner: 2});
  assert.deepEqual(await first.get('shared'), {owner: 1});
  assert.deepEqual(await second.get('shared'), {owner: 2});
  await first.clear();
  assert.equal(await first.get('shared'), null);
  assert.deepEqual(await second.get('shared'), {owner: 2});
  assert.equal(storage.getItem('foreign:key'), 'leave me');
  await exerciseRepository(first);
});

test('storage repository writes canonical JSON', async () => {
  const storage = createStorageMock();
  const repository = createStorageRepository(storage, {namespace: 'test:'});
  await repository.put('ordered', {z: 1, a: 2});
  assert.equal(storage.getItem('test:ordered'), '{"a":2,"z":1}');
});

test('repositories reject empty, controlled, and overlong keys', async () => {
  for (const repository of [createMemoryRepository(), createStorageRepository(createStorageMock())]) {
    for (const key of ['', 'line\nbreak', 'x'.repeat(1025)]) {
      await assert.rejects(repository.put(key, true), error => error.code === 'E_KEY');
      await assert.rejects(repository.get(key), error => error.code === 'E_KEY');
      await assert.rejects(repository.delete(key), error => error.code === 'E_KEY');
    }
  }
});
