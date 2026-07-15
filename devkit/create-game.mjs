#!/usr/bin/env node
// `ludotape-create` -- interactive/non-interactive game scaffolder. Zero dependencies.
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {resolve} from 'node:path';
import {scaffoldGame} from './index.mjs';
import {gameReadmeSnippet} from './templates/readme.mjs';

const USAGE = `Usage: ludotape-create [options]

Scaffold a new Ludotape game module + scenarios file from the devkit templates.

Options:
  --name <name>    File/game base name (prompted if omitted; "my-game" with --yes)
  --id <id>        Game id (default "example/<name>")
  --dir <dir>      Target directory (prompted if omitted; "." with --yes)
  --title <title>  Display title (default <name>)
  --yes, -y        Skip interactive prompts, using flags/defaults for anything unset
  --force          Overwrite existing files
  --help, -h       Show this message
`;

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--force') flags.force = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg.startsWith('--name=')) flags.name = arg.slice('--name='.length);
    else if (arg === '--name') flags.name = argv[++i];
    else if (arg.startsWith('--id=')) flags.id = arg.slice('--id='.length);
    else if (arg === '--id') flags.id = argv[++i];
    else if (arg.startsWith('--dir=')) flags.dir = arg.slice('--dir='.length);
    else if (arg === '--dir') flags.dir = argv[++i];
    else if (arg.startsWith('--title=')) flags.title = arg.slice('--title='.length);
    else if (arg === '--title') flags.title = argv[++i];
  }
  return flags;
}

async function promptMissing(flags) {
  const rl = createInterface({input: stdin, output: stdout});
  try {
    const name = flags.name ?? ((await rl.question('Game name (e.g. my-game): ')).trim() || 'my-game');
    const id = flags.id ?? ((await rl.question(`Game id [example/${name}]: `)).trim() || `example/${name}`);
    const dir = flags.dir ?? ((await rl.question('Target directory [.]: ')).trim() || '.');
    const title = flags.title ?? ((await rl.question(`Title [${name}]: `)).trim() || name);
    return {name, id, dir, title};
  } finally {
    rl.close();
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return;
  }

  const name = flags.name ?? 'my-game';
  const values = flags.yes
    ? {name, id: flags.id ?? `example/${name}`, dir: flags.dir ?? '.', title: flags.title ?? name}
    : await promptMissing(flags);

  const {files} = await scaffoldGame({...values, force: Boolean(flags.force)});
  const base = resolve(values.dir);
  console.log(`Created:\n${files.map(f => `  ${f}`).join('\n')}\n`);
  console.log(gameReadmeSnippet({
    name: values.name,
    id: values.id,
    dir: base,
    fileName: `${values.name}.mjs`,
    scenariosFileName: `${values.name}.scenarios.mjs`
  }));
}

main().catch(error => {
  console.error(`${error.code ?? error.name ?? 'Error'}: ${error.message}`);
  process.exitCode = 1;
});
