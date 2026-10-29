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

// Use explicit fetch timeouts so a stalled Discord REST request cannot hang CI for minutes.
async function discordRequest(route, { method = 'GET', body } = {}) {
  const url = `https://discord.com/api/v10${route}`;
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          authorization: `Bot ${token}`,
          'content-type': 'application/json',
          'user-agent': 'DiscordBot (https://github.com/soire07/pogaca-frieren-, 1.0.0)'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000)
      });
    } catch (error) {
      console.error('Discord REST network request failed.', JSON.stringify({
        method, route, attempt, name: error?.name ?? 'Error',
        message: error?.message ?? String(error)
      }));
      if (attempt === attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      continue;
    }

    const responseText = await response.text();
    let data = null;
    if (responseText) {
      try { data = JSON.parse(responseText); }
      catch { data = { message: responseText.slice(0, 500) }; }
    }
    if (response.ok) return data;

    const retryable = response.status === 429 || response.status >= 500;
    console.error('Discord REST request returned an error.', JSON.stringify({
      method, route, attempt, status: response.status,
      message: data?.message ?? 'No response message'
    }));
    if (!retryable || attempt === attempts) {
      const error = new Error(`Discord API ${method} ${route} returned HTTP ${response.status}: ${data?.message ?? 'unknown error'}`);
      error.status = response.status;
      throw error;
    }
    const retryAfter = Number(response.headers.get('retry-after') || data?.retry_after || attempt);
    await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(retryAfter * 1000, 500), 10_000)));
  }
  throw new Error('Discord REST request exhausted retry attempts.');
}

async function putWithDiagnostics(route, body, label) {
  try {
    return await discordRequest(route, { method: 'PUT', body });
  } catch (error) {
    console.error(`Discord API command registration failed (${label}).`, JSON.stringify({
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      status: error?.status ?? null,
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

const configuredGuildIds = [...new Set(
  (process.env.GUILD_IDS?.trim() || process.env.GUILD_ID?.trim() || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
)];
let targetDescription = configuredGuildIds.length
  ? 'Discord command targets: ' + configuredGuildIds.map(id => '…' + id.slice(-4)).join(', ') + ' (resolving server names)'
  : 'Discord command target: GLOBAL (GUILD_ID/GUILD_IDS missing or empty)';

try {
  console.log(targetDescription);
  await publishCommitStatus('pending', targetDescription);
  console.log(`Discord command sync starting: ${commands.length} commands.`);

  if (configuredGuildIds.length) {
    // Resolve every target before any command list is changed. This makes the target IDs auditable
    // and prevents a mistyped/missing guild from causing a partial command deployment.
    const targetGuilds = [];
    for (const guildId of configuredGuildIds) {
      const guild = await discordRequest(Routes.guild(guildId));
      if (String(guild?.id) !== guildId || typeof guild?.name !== 'string') {
        throw new Error('A configured guild ID did not resolve to the expected Discord guild.');
      }
      targetGuilds.push({ id: guild.id, name: guild.name });
    }

    targetDescription = 'Discord command targets: ' + targetGuilds
      .map(guild => `${guild.name} (ID …${guild.id.slice(-4)})`)
      .join('; ');
    console.log(targetDescription);
    await publishCommitStatus('pending', targetDescription);

    // Register all configured guilds first; if any registration fails, preserve global commands.
    for (const guild of targetGuilds) {
      await putWithDiagnostics(
        Routes.applicationGuildCommands(clientId, guild.id),
        commands,
        'guild registration: ' + guild.name
      );
      console.log(`${commands.length} commands registered in ${guild.name} (ID ending ${guild.id.slice(-4)}).`);
    }

    // Clear legacy global duplicates only after every configured target was updated successfully.
    await putWithDiagnostics(Routes.applicationCommands(clientId), [], 'clear legacy global commands');
    console.log('Legacy global command registrations cleared after every target guild succeeded.');
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
