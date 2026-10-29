import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  throw new Error('DISCORD_TOKEN ve CLIENT_ID Render Environment içinde olmalı.');
}


async function findCommandFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const commands = [];
const root = __dirname;
const rootFiles = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
  .map(entry => join(root, entry.name))
  .filter(file => !['index.js', 'deploy-commands.js'].includes(file.split(/[\\/]/).pop()));
const nestedFiles = await findCommandFiles(join(root, 'commands'));
const files = [...rootFiles, ...nestedFiles];

for (const filePath of files) {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    if (mod.default?.data && typeof mod.default.data.toJSON === 'function' && !mod.default?.internalOnly) {
      commands.push(mod.default.data.toJSON());
    }
  } catch (error) {
    console.error(`${filePath} yüklenemedi; komut kaydı durduruldu:`, error);
    process.exitCode = 1;
    throw error;
  }
}

const names = commands.map(command => command.name);
const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
if (duplicates.length) {
  throw new Error('Tekrarlanan slash komut adları: ' + [...new Set(duplicates)].join(', '));
}
console.log(`Kaydedilmeye hazır ${commands.length} komut doğrulandı.`);

// Let discord.js own its timeout/retry policy; do not race it with an external AbortSignal.
const rest = new REST({ version: '10', timeout: 60_000, retries: 2 }).setToken(token);

async function putWithDiagnostics(route, body, label) {
  try {
    return await rest.put(route, { body });
  } catch (error) {
    console.error(`Discord API command registration failed (${label}).`, JSON.stringify({
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      status: error?.status ?? null,
      code: error?.code ?? null,
      route
    }));
    throw error;
  }
}

// Publish a non-secret deployment-target summary on the workflow commit so it can be
// audited without exposing the Discord token or other secrets.
async function publishCommitStatus(state, description) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (process.env.GITHUB_ACTIONS !== 'true' || !token || !repository || !sha) return;
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/statuses/${sha}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify({
        state,
        context: 'discord-command-target',
        description: description.slice(0, 140),
        target_url: process.env.GITHUB_RUN_ID
          ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : undefined
      })
    });
    if (!response.ok) console.error('Could not publish safe Discord target status; HTTP', response.status);
  } catch (error) {
    console.error('Could not publish safe Discord target status:', error?.message || error);
  }
}

const configuredGuildId = process.env.GUILD_ID?.trim();
let targetDescription = configuredGuildId
  ? 'Discord command target: guild ID ending ' + configuredGuildId.slice(-4) + ' (resolving server name)'
  : 'Discord command target: GLOBAL (GUILD_ID is missing or empty)';

try {
  console.log(targetDescription);
  await publishCommitStatus('pending', targetDescription);
  console.log(`Discord command sync starting: ${commands.length} commands.`);

  if (configuredGuildId) {
    // Verify that this bot can resolve the target guild before changing any command list.
    const targetGuild = await rest.get(Routes.guild(configuredGuildId));
    if (String(targetGuild?.id) !== configuredGuildId || typeof targetGuild?.name !== 'string') {
      throw new Error('Configured GUILD_ID did not resolve to the expected Discord guild.');
    }
    targetDescription = `Discord command target: ${targetGuild.name} (ID ending ${configuredGuildId.slice(-4)})`;
    console.log(targetDescription);
    await publishCommitStatus('pending', targetDescription);

    // Register the target guild first; if it fails, preserve existing global commands.
    await putWithDiagnostics(
      Routes.applicationGuildCommands(clientId, configuredGuildId),
      commands,
      'target guild registration'
    );
    console.log(`${commands.length} commands registered in target guild.`);

    // Clear legacy global duplicates only after target registration has succeeded.
    await putWithDiagnostics(Routes.applicationCommands(clientId), [], 'clear legacy global commands');
    console.log('Legacy global command registrations cleared.');
  } else {
    await putWithDiagnostics(
      Routes.applicationCommands(clientId),
      commands,
      'global registration'
    );
    console.log(`${commands.length} commands registered globally.`);
  }

  await publishCommitStatus('success', targetDescription);
  console.log('Discord command sync completed.');
} catch (error) {
  await publishCommitStatus('failure', targetDescription + ' — registration failed');
  throw error;
}
