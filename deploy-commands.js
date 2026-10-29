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

const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_SAFETY_MARGIN_MS = 10_000;
const RATE_LIMIT_BACKOFF_MULTIPLIER = 2;
let lastRateLimitInfo = null;
let lastHttpErrorCode = null;
let lastHttpErrorMessage = null;
const rest = new REST({
  version: '10',
  offset: 5000,
  rejectOnRateLimit: ['/applications'],
  makeRequest: async (url, init) => {
    const response = await fetch(url, init);
    if (response.status === 429) {
      const data = await response.clone().json().catch(() => null);
      lastHttpErrorCode = data?.code ?? null;
      lastHttpErrorMessage = typeof data?.message === 'string' ? data.message : null;
      console.warn('Discord HTTP 429 response diagnostics.', JSON.stringify({
        status: response.status,
        retryAfterHeader: response.headers.get('retry-after'),
        scope: response.headers.get('x-ratelimit-scope'),
        bucket: response.headers.get('x-ratelimit-bucket'),
        globalHeader: response.headers.get('x-ratelimit-global'),
        resetAfter: response.headers.get('x-ratelimit-reset-after'),
        remaining: response.headers.get('x-ratelimit-remaining'),
        limit: response.headers.get('x-ratelimit-limit'),
        message: typeof data?.message === 'string' ? data.message.slice(0, 160) : null,
        retryAfterBodySeconds: Number.isFinite(data?.retry_after) ? data.retry_after : null,
        globalBody: typeof data?.global === 'boolean' ? data.global : null,
        code: data?.code ?? null
      }));
    }
    return response;
  }
}).setToken(token);

rest.on('rateLimited', info => {
  lastRateLimitInfo = info;
  console.warn('Discord REST rate limit encountered.', JSON.stringify({
    method: info.method,
    route: info.route,
    bucket: info.hash,
    limit: info.limit,
    retryAfterSeconds: Number((info.retryAfter / 1000).toFixed(3)),
    resetAfterSeconds: Number((info.timeToReset / 1000).toFixed(3)),
    globalRateLimit: info.global,
    scope: info.scope,
    majorParameter: info.majorParameter
  }));
});


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

// Keep discord.js's route tracking, but reject 429s so this script controls the
// retry boundary. Re-queueing at the exact reset boundary caused repeated 429s.
async function discordRequest(route, { method = 'GET', body } = {}) {
  const maxAttempts = MAX_RATE_LIMIT_RETRIES + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastRateLimitInfo = null;
    lastHttpErrorCode = null;
    lastHttpErrorMessage = null;
    try {
      if (method === 'GET') return await rest.get(route);
      if (method === 'PUT') return await rest.put(route, { body });
      throw new Error('Unsupported Discord REST method: ' + method);
    } catch (error) {
      const status = error?.status ?? error?.httpStatus ?? null;
      const retryAfterMs = Number(lastRateLimitInfo?.retryAfter ?? error?.retryAfter);
      const rateLimited = status === 429 || error?.name?.startsWith('RateLimitError') || lastRateLimitInfo !== null;
      const dailyCommandCreateLimit = Number(lastHttpErrorCode ?? error?.code) === 30034
        || /daily application command creates/i.test(lastHttpErrorMessage ?? error?.message ?? '');

      console.error('Discord REST request failed.', JSON.stringify({
        method,
        route,
        attempt,
        maxAttempts,
        name: error?.name ?? 'Error',
        status,
        code: error?.code ?? null,
        httpErrorCode: lastHttpErrorCode,
        httpErrorMessage: lastHttpErrorMessage,
        message: error?.message ?? String(error),
        retryAfterSeconds: Number.isFinite(retryAfterMs) && retryAfterMs > 0
          ? Number((retryAfterMs / 1000).toFixed(3))
          : null,
        scope: lastRateLimitInfo?.scope ?? null,
        bucket: lastRateLimitInfo?.hash ?? null
      }));

      // Discord code 30034 is the daily application-command creation cap, not a transient
      // route 429. Retrying a bulk overwrite can consume more creates and keep the bot offline.
      if (dailyCommandCreateLimit) {
        console.error('Discord daily application-command creation limit reached (30034); stopping writes without retry.');
        throw error;
      }

      if (!rateLimited || attempt === maxAttempts || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
        throw error;
      }

      const exponentialBackoffMs = Math.ceil(retryAfterMs * (RATE_LIMIT_BACKOFF_MULTIPLIER ** (attempt - 1)));
      const delayMs = exponentialBackoffMs + RATE_LIMIT_SAFETY_MARGIN_MS;
      console.warn(
        `Discord 429: attempt ${attempt}/${maxAttempts - 1}; waiting ${Math.ceil(delayMs / 1000)} seconds before retry.`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Discord REST request exhausted its bounded retry attempts.');
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
const testGuildId = process.env.TEST_GUILD_ID?.trim() || '';
const testCommandNames = [...new Set(
  (process.env.TEST_COMMAND_NAMES?.trim() || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
)];
if (!configuredGuildIds.length) {
  throw new Error('GUILD_IDS must explicitly contain the production guild ID; global command registration is disabled.');
}
if (testGuildId && !testCommandNames.length) {
  throw new Error('TEST_GUILD_ID requires an explicit TEST_COMMAND_NAMES allowlist.');
}
if (testGuildId && configuredGuildIds.includes(testGuildId)) {
  throw new Error('The test guild must not also be listed as a production guild.');
}
const testCommands = testGuildId
  ? commands.filter(command => testCommandNames.includes(command.name))
  : [];
if (testGuildId) {
  const missingTestCommands = testCommandNames.filter(name => !commands.some(command => command.name === name));
  if (missingTestCommands.length) {
    throw new Error('Configured test commands were not found: ' + missingTestCommands.map(name => '/' + name).join(', '));
  }
  if (testCommands.length !== testCommandNames.length) {
    throw new Error('Test command allowlist contains duplicate names.');
  }
}
let targetDescription = 'Production guild IDs: ' + configuredGuildIds.map(id => '…' + id.slice(-4)).join(', ');
if (testGuildId) {
  targetDescription += '; test guild …' + testGuildId.slice(-4) + ' will receive only: '
    + testCommands.map(command => '/' + command.name).join(', ');
}
try {
  console.log(targetDescription);
  await publishCommitStatus('pending', targetDescription);
  console.log(`Discord command sync starting: ${commands.length} production commands and ${testCommands.length} test commands.`);

  // Resolve every target before any command list is changed. Never fall back to global registration.
  const targetGuilds = [];
  for (const guildId of configuredGuildIds) {
    const guild = await discordRequest(Routes.guild(guildId));
    if (String(guild?.id) !== guildId || typeof guild?.name !== 'string') {
      throw new Error('A configured production guild ID did not resolve to the expected Discord guild.');
    }
    targetGuilds.push({ id: guild.id, name: guild.name, commands, kind: 'production' });
  }
  if (testGuildId) {
    const guild = await discordRequest(Routes.guild(testGuildId));
    if (String(guild?.id) !== testGuildId || typeof guild?.name !== 'string') {
      throw new Error('The configured test guild ID did not resolve to the expected Discord guild.');
    }
    targetGuilds.push({ id: guild.id, name: guild.name, commands: testCommands, kind: 'test' });
  }

  targetDescription = 'Discord command targets: ' + targetGuilds
    .map(guild => `${guild.name} (ID …${guild.id.slice(-4)}): ${guild.commands.length} commands [${guild.kind}]`)
    .join('; ');
  console.log(targetDescription);
  await publishCommitStatus('pending', targetDescription);

  // Read current state first. A bulk overwrite on every run needlessly consumes
  // Discord's daily application-command creation quota even when nothing changed.
  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .filter(key => !['id', 'application_id', 'guild_id', 'version'].includes(key))
          .sort()
          .map(key => [key, stableValue(value[key])])
      );
    }
    return value;
  }

  function matchesDesiredCommand(existing, desired) {
    // Discord adds response-only fields and may materialize defaults. Compare every
    // field authored by this repository, ignoring only server-generated identifiers.
    const normalize = value => {
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.keys(value)
            .filter(key => !['id', 'application_id', 'guild_id', 'version'].includes(key))
            .sort()
            .map(key => [key, normalize(value[key])])
        );
      }
      return value;
    };
    const current = normalize(existing);
    const wanted = normalize(desired);
    return Object.entries(wanted).every(([key, value]) => {
      if (value === undefined) return true;
      if (Array.isArray(value)) {
        return Array.isArray(current[key]) && JSON.stringify(stableValue(current[key])) === JSON.stringify(stableValue(value));
      }
      if (value && typeof value === 'object') {
        return current[key] && typeof current[key] === 'object' && matchesDesiredCommand(current[key], value);
      }
      return current[key] === value || (value == null && current[key] == null);
    });
  }

  for (const guild of targetGuilds) {
    const route = Routes.applicationGuildCommands(clientId, guild.id);
    const existingCommands = await discordRequest(route);
    const existingByName = new Map(existingCommands.map(command => [command.name, command]));
    const sameNames = existingCommands.length === guild.commands.length
      && guild.commands.every(command => existingByName.has(command.name));
    const sameDefinitions = sameNames
      && guild.commands.every(command => matchesDesiredCommand(existingByName.get(command.name), command));

    if (sameDefinitions) {
      console.log(`No changes for ${guild.name} (${guild.kind}); skipped command write to preserve daily quota.`);
      continue;
    }

    await putWithDiagnostics(
      route,
      guild.commands,
      guild.kind + ' guild registration: ' + guild.name
    );
    console.log(`Updated ${guild.commands.length} commands in ${guild.name} (${guild.kind}, ID ending ${guild.id.slice(-4)}).`);
  }

  // Clear legacy global duplicates only when they actually exist.
  const globalRoute = Routes.applicationCommands(clientId);
  const existingGlobalCommands = await discordRequest(globalRoute);
  if (existingGlobalCommands.length) {
    await putWithDiagnostics(globalRoute, [], 'clear legacy global commands');
    console.log('Legacy global command registrations cleared after every configured guild was verified.');
  } else {
    console.log('No legacy global commands found; skipped unnecessary global command write.');
  }

  await publishCommitStatus('success', targetDescription);
  console.log('Discord command sync completed.');
} catch (error) {
  await publishCommitStatus('failure', targetDescription + ' — registration failed');
  throw error;
}
