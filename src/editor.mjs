import {clone, digest, deepFreeze, LudotapeError} from './index.mjs';

function editorError(message) {
  throw new LudotapeError('E_EDITOR', message);
}

function makeDraft(initial, initialRevision) {
  let document = clone(initial);
  let revision = initialRevision;
  const history = [];
  const redoStack = [];

  const draft = {
    get document() { return clone(document); },
    get revision() { return revision; },
    get dirty() { return history.length > 0; },
    get historyLength() { return history.length; },
    get redoLength() { return redoStack.length; },
    replace(next, label = 'replace') {
      const nextDocument = clone(next);
      history.push({document, revision, label: String(label)});
      redoStack.length = 0;
      document = nextDocument;
      revision++;
      return clone(document);
    },
    update(mutator, label = 'update') {
      if (typeof mutator !== 'function') editorError('mutator required');
      return this.replace(mutator(clone(document)), label);
    },
    undo() {
      const previous = history.pop();
      if (!previous) return false;
      redoStack.push({document, revision, label: previous.label});
      document = previous.document;
      revision++;
      return true;
    },
    redo() {
      const next = redoStack.pop();
      if (!next) return false;
      history.push({document, revision, label: next.label});
      document = next.document;
      revision++;
      return clone(document);
    },
    snapshot() {
      return deepFreeze({
        format: 'ludotape/draft@1',
        revision,
        document: clone(document),
        digest: digest(document)
      });
    },
    markSaved() {
      history.length = 0;
      redoStack.length = 0;
    }
  };
  return Object.freeze(draft);
}

/** Create an isolated, revisioned game-document draft. */
export function createDraft(initial = {}) {
  return makeDraft(initial, 0);
}

/** Restore and validate a saved ludotape/draft@1 snapshot. */
export function restoreDraft(snapshot) {
  let clean;
  try {
    clean = clone(snapshot);
  } catch (error) {
    editorError(`invalid draft snapshot: ${error.message}`);
  }
  if (!clean || Array.isArray(clean) || clean.format !== 'ludotape/draft@1') {
    editorError('snapshot format must be ludotape/draft@1');
  }
  if (!Number.isSafeInteger(clean.revision) || clean.revision < 0) {
    editorError('snapshot revision must be a non-negative safe integer');
  }
  let documentDigest;
  try { documentDigest = digest(clean.document); }
  catch (error) { editorError(`invalid draft document: ${error.message}`); }
  if (typeof clean.digest !== 'string' || clean.digest !== documentDigest) {
    editorError('snapshot digest does not match document');
  }
  const draft = makeDraft(clean.document, clean.revision);
  draft.markSaved();
  return draft;
}
