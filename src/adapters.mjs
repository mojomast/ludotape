const LIMITS = Object.freeze({depth: 64, nodes: 50000, text: 2 * 1024 * 1024});

function limitError(message) {
  return Object.assign(new Error(message), {code: 'E_ADAPTER_LIMIT'});
}

function renderTree(view, leaf, branch) {
  let nodes = 0;
  let text = 0;
  const walk = (value, parent, depth) => {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) throw limitError('adapter render limit exceeded');
    if (value === null || typeof value !== 'object') {
      const string = String(value);
      text += string.length;
      if (text > LIMITS.text) throw limitError('adapter text limit exceeded');
      leaf(string, parent);
      return;
    }
    branch(value, parent, (child, target) => walk(child, target, depth + 1));
  };
  return parent => walk(view, parent, 0);
}

export function semanticAdapter(root) {
  if (!root || typeof root.replaceChildren !== 'function') throw new TypeError('DOM root required');
  const doc = root.ownerDocument ?? globalThis.document;
  if (!doc || typeof doc.createDocumentFragment !== 'function' || typeof doc.createElement !== 'function' || typeof doc.createTextNode !== 'function') {
    throw new TypeError('DOM document required');
  }
  return view => {
    const fragment = doc.createDocumentFragment();
    renderTree(view, (string, parent) => parent.append(doc.createTextNode(string)), (value, parent, recurse) => {
      const array = Array.isArray(value);
      const element = doc.createElement(array ? 'ol' : 'dl');
      element.setAttribute('role', array ? 'list' : 'tree');
      for (const [key, child] of Object.entries(value)) {
        const row = doc.createElement(array ? 'li' : 'div');
        row.setAttribute('role', array ? 'listitem' : 'treeitem');
        if (!array) {
          const term = doc.createElement('dt');
          term.textContent = key;
          term.setAttribute('aria-label', key);
          row.append(term);
        }
        const description = doc.createElement(array ? 'span' : 'dd');
        recurse(child, description);
        row.append(description);
        element.append(row);
      }
      parent.append(element);
    })(fragment);
    root.replaceChildren(fragment);
  };
}

export function canvasAdapter(canvas, {draw} = {}) {
  const context = canvas?.getContext?.('2d');
  if (!context) throw new TypeError('2D canvas required');
  let lastView;
  let lastInfo;
  let hasRendered = false;

  function render(view, info) {
    if (draw) return draw(context, view, info);
    const text = JSON.stringify(view, null, 2);
    if (text.length > LIMITS.text) throw limitError('adapter text limit exceeded');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111827';
    context.font = '14px monospace';
    text.split('\n').slice(0, 10000).forEach((line, index) => context.fillText(line, 10, 20 + index * 16));
  }

  const ResizeObserverClass = canvas.ownerDocument?.defaultView?.ResizeObserver ?? globalThis.ResizeObserver;
  const observer = typeof ResizeObserverClass === 'function'
    ? new ResizeObserverClass(() => { if (hasRendered) render(lastView, lastInfo); })
    : null;
  observer?.observe(canvas);

  const adapter = (view, info) => {
    lastView = view;
    lastInfo = info;
    hasRendered = true;
    return render(view, info);
  };
  adapter.disconnect = () => observer?.disconnect();
  return adapter;
}

function terminalValue(value) {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  return String(value);
}

/** Create a deterministic text adapter for Node.js terminals and custom writers. */
export function terminalAdapter(writeFn, {depth = 4, indent = 2} = {}) {
  if (typeof writeFn !== 'function') throw new TypeError('writeFn must be a function');
  if (!Number.isSafeInteger(depth) || depth < 0) throw new TypeError('depth must be a non-negative safe integer');
  if (!Number.isSafeInteger(indent) || indent < 0) throw new TypeError('indent must be a non-negative safe integer');

  return view => {
    const lines = [];
    const walk = (value, level, prefix = '') => {
      const padding = ' '.repeat(level * indent);
      if (value !== null && typeof value === 'object') {
        if (level >= depth) {
          lines.push(`${padding}${prefix}[...]`);
          return;
        }
        const entries = Object.entries(value);
        if (!Array.isArray(value)) entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
        if (entries.length === 0) {
          lines.push(`${padding}${prefix}${Array.isArray(value) ? '[]' : '{}'}`);
          return;
        }
        for (const [key, child] of entries) {
          const label = Array.isArray(value) ? '- ' : `${key}: `;
          if (child !== null && typeof child === 'object') {
            lines.push(`${padding}${label.trimEnd()}`);
            walk(child, level + 1);
          } else {
            lines.push(`${padding}${label}${terminalValue(child)}`);
          }
        }
        return;
      }
      lines.push(`${padding}${prefix}${terminalValue(value)}`);
    };
    walk(view, 0);
    const output = `${lines.join('\n')}\n`;
    if (output.length > LIMITS.text) throw limitError('adapter text limit exceeded');
    writeFn(output);
  };
}
