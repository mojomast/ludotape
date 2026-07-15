import {
  compileCartridge,
  createRun,
  availability,
  dispatch,
  project,
  createReplay,
  verifyReplay
} from '../src/index.mjs';
import {semanticAdapter, canvasAdapter} from '../src/adapters.mjs';

const $ = selector => document.querySelector(selector);
const state = {game: null, cartridge: null, run: null};
let activeTab = 'play';

const semantic = semanticAdapter($('#semantic'));
const canvas = canvasAdapter($('#canvas'), {
  draw(context, view) {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    context.font = '16px monospace';
    context.fillStyle = '#111';
    if (view.kind === 'grid') {
      const size = 45;
      context.fillStyle = '#334155';
      for (const [x, y] of view.walls) context.fillRect(x * size, y * size, size, size);
      context.fillStyle = '#fde047';
      for (const [x, y] of view.goals) context.fillRect(x * size + 12, y * size + 12, 20, 20);
      context.fillStyle = '#f97316';
      for (const [x, y] of view.crates) context.fillRect(x * size + 7, y * size + 7, 30, 30);
      context.fillStyle = '#0ea5e9';
      context.beginPath();
      context.arc(view.player[0] * size + 22, view.player[1] * size + 22, 15, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillText(`Round ${view.round}  Score ${view.score}`, 20, 30);
      view.hand.forEach((value, index) => context.fillText(`[${value}]`, 20 + index * 55, 80));
    }
  }
});

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function selectTab(tab) {
  activeTab = tab;
  for (const section of document.querySelectorAll('main section')) section.hidden = section.id !== activeTab;
  for (const button of document.querySelectorAll('[data-tab]')) {
    const selected = button.dataset.tab === activeTab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
}

async function choose() {
  try {
    const path = $('#game').value === 'warehouse'
      ? '../examples/warehouse-circuit.mjs'
      : '../examples/card-duel.mjs';
    const module = await import(path);
    state.game = module.game;
    $('#document').value = JSON.stringify(module.document, null, 2);
    restart();
  } catch (error) {
    $('#editor-status').textContent = `Unable to load game: ${errorMessage(error)}`;
  }
}

function restart() {
  const parsedSeed = parseInt($('#seed').value, 10);
  if (!Number.isSafeInteger(parsedSeed)) {
    $('#editor-status').textContent = 'Seed must be a safe integer.';
    return false;
  }
  try {
    const documentValue = JSON.parse($('#document').value);
    const cartridge = compileCartridge(state.game, documentValue);
    const run = createRun(cartridge, {seed: parsedSeed});
    state.cartridge = cartridge;
    state.run = run;
    $('#editor-status').textContent = `Identity ${state.cartridge.identity.slice(0, 12)}…`;
    render();
    selectTab(activeTab);
    return true;
  } catch (error) {
    $('#editor-status').textContent = `Could not apply document: ${errorMessage(error)}`;
    return false;
  }
}

function dispatchAction(action) {
  dispatch(state.run, action);
  render();
}

function render() {
  project(state.run, semantic);
  project(state.run, canvas);
  $('#turn').value = state.run.turn;
  const actions = availability(state.run);
  $('#actions').replaceChildren(...actions.map(action => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.direction ?? `Play ${action.value}`;
    button.onclick = () => {
      try { dispatchAction(action); }
      catch (error) { $('#editor-status').textContent = `Action failed: ${errorMessage(error)}`; }
    };
    return button;
  }));
  $('#rewind').disabled = state.run.turn === 0;
  selectTab(activeTab);
}

function rewind() {
  if (!state.run?.journal.length) return false;
  const fullReplay = createReplay(state.run);
  const actions = fullReplay.actions.slice(0, -1);
  const checkpoints = fullReplay.checkpoints.slice(0, -1);
  const replay = {
    ...fullReplay,
    actions,
    checkpoints,
    final: checkpoints.at(-1) ?? fullReplay.initial
  };
  const result = verifyReplay(state.cartridge, replay);
  if (result.ok) {
    state.run = result.run;
  } else {
    const fallback = createRun(state.cartridge, {seed: state.run.seed});
    for (const action of actions) dispatch(fallback, action);
    state.run = fallback;
  }
  render();
  return true;
}

for (const button of document.querySelectorAll('[data-tab]')) {
  button.onclick = () => selectTab(button.dataset.tab);
  button.onkeydown = event => {
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const index = tabs.indexOf(button);
    let target;
    if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
    else if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === 'Home') target = tabs[0];
    else if (event.key === 'End') target = tabs.at(-1);
    if (!target) return;
    event.preventDefault();
    selectTab(target.dataset.tab);
    target.focus();
  };
}

$('#load').onclick = () => { choose(); };
$('#apply').onclick = () => {
  try { restart(); }
  catch (error) { $('#editor-status').textContent = `Could not apply document: ${errorMessage(error)}`; }
};
$('#export').onclick = () => {
  try { $('#replay-text').value = JSON.stringify(createReplay(state.run), null, 2); }
  catch (error) { $('#verify-status').textContent = `Export failed: ${errorMessage(error)}`; }
};
$('#verify').onclick = () => {
  try {
    const replay = JSON.parse($('#replay-text').value);
    const result = verifyReplay(state.cartridge, replay);
    $('#verify-status').textContent = JSON.stringify({...result, run: undefined}, null, 2);
    if (result.ok) {
      state.run = result.run;
      render();
    }
  } catch (error) {
    $('#verify-status').textContent = `Could not parse replay: ${errorMessage(error)}`;
  }
};
$('#rewind').onclick = () => {
  try { rewind(); }
  catch (error) { $('#editor-status').textContent = `Rewind failed: ${errorMessage(error)}`; }
};

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target?.isContentEditable;
  const interactive = event.target?.closest?.('button, a, [role="button"], [role="tab"]');
  if (editable || interactive) return;
  const key = event.key;
  try {
    if ((key === ' ' || key === 'Enter') && state.run) {
      const actions = availability(state.run);
      if (actions.length !== 1) return;
      event.preventDefault();
      dispatchAction(actions[0]);
    } else if (key === 'Backspace' || key.toLowerCase() === 'z') {
      event.preventDefault();
      rewind();
    } else if (key.toLowerCase() === 'r') {
      event.preventDefault();
      restart();
    } else if (key.toLowerCase() === 'e') {
      event.preventDefault();
      selectTab('replay');
      $('#export').focus();
    }
  } catch (error) {
    $('#editor-status').textContent = `Shortcut failed: ${errorMessage(error)}`;
  }
});

selectTab(activeTab);
choose();
