import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasAdapter, semanticAdapter, terminalAdapter} from '../src/adapters.mjs';

test('terminalAdapter prints nested objects and arrays', () => {
  const writes = [];
  const render = terminalAdapter(text => writes.push(text));
  render({score: 3, hand: [1, {value: 2}]});
  assert.equal(writes[0], 'hand:\n  - 1\n  -\n    value: 2\nscore: 3\n');
});

test('terminalAdapter truncates values beyond configured depth', () => {
  let output = '';
  terminalAdapter(text => { output = text; }, {depth: 2, indent: 4})({outer: {inner: {value: 1}}});
  assert.equal(output, 'outer:\n    inner:\n        [...]\n');
});

class MockNode {
  constructor(tagName = '#node', ownerDocument = null) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  replaceChildren(...children) { this.children = children; }
}

class MockDocument {
  createDocumentFragment() { return new MockNode('#fragment', this); }
  createElement(tagName) { return new MockNode(tagName, this); }
  createTextNode(text) { const node = new MockNode('#text', this); node.textContent = text; return node; }
}

function collect(node, tagName, output = []) {
  if (node.tagName === tagName) output.push(node);
  for (const child of node.children ?? []) collect(child, tagName, output);
  return output;
}

test('semanticAdapter assigns tree and list ARIA semantics', () => {
  const document = new MockDocument();
  const root = new MockNode('root', document);
  semanticAdapter(root)({title: 'Demo', actions: ['left', 'right']});
  const fragment = root.children[0];
  assert.equal(collect(fragment, 'dl')[0].attributes.get('role'), 'tree');
  assert.ok(collect(fragment, 'div').every(row => row.attributes.get('role') === 'treeitem'));
  assert.equal(collect(fragment, 'ol')[0].attributes.get('role'), 'list');
  assert.ok(collect(fragment, 'li').every(item => item.attributes.get('role') === 'listitem'));
  for (const term of collect(fragment, 'dt')) assert.equal(term.attributes.get('aria-label'), term.textContent);
});

test('canvasAdapter forwards draw arguments and redraws after resize', () => {
  const previous = globalThis.ResizeObserver;
  let resizeCallback;
  let observed;
  globalThis.ResizeObserver = class {
    constructor(callback) { resizeCallback = callback; }
    observe(value) { observed = value; }
    disconnect() {}
  };
  try {
    const context = {};
    const canvas = {getContext: kind => kind === '2d' ? context : null};
    const calls = [];
    const adapter = canvasAdapter(canvas, {draw: (...args) => calls.push(args)});
    const view = {kind: 'test'};
    const info = {turn: 2};
    adapter(view, info);
    assert.equal(observed, canvas);
    assert.deepEqual(calls[0], [context, view, info]);
    resizeCallback();
    assert.deepEqual(calls[1], [context, view, info]);
    adapter.disconnect();
  } finally {
    if (previous === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previous;
  }
});
