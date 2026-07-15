#!/usr/bin/env node
// `ludotape-create-core` -- interactive/non-interactive custom-core scaffolder. Zero deps.
import {createInterface} from 'node:readline/promises';
import {stdin, stdout} from 'node:process';
import {resolve} from 'node:path';
import {scaffoldCore} from './index.mjs';

const USAGE = `Usage: ludotape-create-core [options]

Scaffold a new custom ICore implementation (document-driven counter template).

Options:
  --id <id>        Core id (prompted if omitted; "example/my-core" with --yes)
  --name <name>    Display name (default <id>)
  --dir <dir>      Target directory (prompted if omitted; "./my-core" with --yes)
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
    else if (arg.startsWith('--id=')) flags.id = arg.slice('--id='.length);
    else if (arg === '--id') flags.id = argv[++i];
    else if (arg.startsWith('--name=')) flags.name = arg.slice('--name='.length);
    else if (arg === '--name') flags.name = argv[++i];
    else if (arg.startsWith('--dir=')) flags.dir = arg.slice('--dir='.length);
    else if (arg === '--dir') flags.dir = argv[++i];
  }
  return flags;
}

async function promptMissing(flags) {
  const rl = createInterface({input: stdin, output: stdout});
  try {
    const id = flags.id ?? ((await rl.question('Core id (e.g. example/my-core): ')).trim() || 'example/my-core');
    const name = flags.name ?? ((await rl.question(`Display name [${id}]: `)).trim() || id);
    const dir = flags.dir ?? ((await rl.question('Target directory [./my-core]: ')).trim() || './my-core');
    return {id, name, dir};
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

  const id = flags.id ?? 'example/my-core';
  const values = flags.yes
    ? {id, name: flags.name ?? id, dir: flags.dir ?? './my-core'}
    : await promptMissing(flags);

  const {files} = await scaffoldCore({...values, force: Boolean(flags.force)});
  const base = resolve(values.dir);
  console.log(`Created:\n${files.map(f => `  ${f}`).join('\n')}\n`);
  console.log(`Next steps:\n  node devkit/validate-core.mjs ${base}\n  node bin/ludotape.mjs core conformance ${base} ${base}/sample-cartridge.mjs\n`);
}

main().catch(error => {
  console.error(`${error.code ?? error.name ?? 'Error'}: ${error.message}`);
  process.exitCode = 1;
});
