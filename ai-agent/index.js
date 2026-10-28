import 'dotenv/config';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'FRIEREN_ADMIN_IDS'];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) {
  console.error('Missing required environment variables: ' + missing.join(', '));
  process.exit(1);
}

const admins = new Set(process.env.FRIEREN_ADMIN_IDS.split(',').map(value => value.trim()).filter(Boolean));
const rootDir = fileURLToPath(new URL('../', import.meta.url));
const timeoutMs = Math.max(30_000, Math.min(Number(process.env.FRIEREN_TEST_TIMEOUT_MS) || 180_000, 300_000));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Render Web Services require an HTTP port. This lightweight endpoint does not expose bot controls.
const port = Number(process.env.PORT) || 10000;
const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', discordReady: client.isReady() }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Frieren bot test service is running.');
});
healthServer.listen(port, '0.0.0.0', () => console.log('Health server listening on port ' + port));
const runningGuilds = new Set();

const commands = [
  new SlashCommandBuilder().setName('frieren-test').setDescription('Frieren botunun otomatik testlerini çalıştırır.').toJSON(),
];

function redactSecrets(value) {
  let output = value;
  for (const [key, secret] of Object.entries(process.env)) {
    if (/TOKEN|KEY|SECRET|PASSWORD|DATABASE_URL|CONNECTION_STRING/i.test(key) && secret && secret.length >= 8) {
      output = output.split(secret).join('[REDACTED]');
    }
  }
  return output;
}

function runTests() {
  return new Promise(resolve => {
    const child = spawn('npm', ['run', 'check'], {
      cwd: rootDir,
      shell: false,
      windowsHide: true,
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const maxOutput = 20_000;
    const append = (current, chunk) => (current + chunk.toString()).slice(-maxOutput);
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        stdout: redactSecrets(result.stdout),
        stderr: redactSecrets(result.stderr),
      });
    };
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.on('error', error => finish({ code: null, stdout, stderr: stderr + '\n' + error.message, timedOut: false }));
    child.on('close', code => finish({ code, stdout, stderr, timedOut: false }));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ code: null, stdout, stderr: stderr + '\nTest timeout reached.', timedOut: true });
    }, timeoutMs);
  });
}

function buildLocalTestSummary(result) {
  const output = [result.stdout || '', result.stderr || ''].join('\n');
  const readCount = label => {
    const match = output.match(new RegExp('(?:ℹ\\s*)?' + label + '\\s+(\\d+)', 'i'));
    return match ? Number(match[1]) : null;
  };
  const tests = readCount('tests');
  const passed = readCount('pass');
  const failed = readCount('fail');
  const failedLines = output.split(/\r?\n/)
    .filter(line => /^\s*(?:✖|×|not ok\b|✗)\s*/i.test(line))
    .map(line => line.trim())
    .slice(0, 8);

  if (result.timedOut) {
    return 'Testler zaman aşımına uğradı. Süre sınırını ve son test çıktısını kontrol et.';
  }
  if (result.code === 0) {
    const details = [
      tests === null ? null : tests + ' test çalıştırıldı',
      passed === null ? null : passed + ' başarılı',
      failed === null ? null : failed + ' başarısız',
    ].filter(Boolean).join(', ');
    return 'Otomatik testler başarıyla tamamlandı' + (details ? ' (' + details + ').' : '.')
      + ' Bu rapor Gemini kullanılmadan oluşturuldu.';
  }

  const details = [
    tests === null ? null : tests + ' test çalıştırıldı',
    passed === null ? null : passed + ' başarılı',
    failed === null ? null : failed + ' başarısız',
  ].filter(Boolean).join(', ');
  const failures = failedLines.length
    ? '\nBaşarısız testler:\n- ' + failedLines.join('\n- ')
    : '\nAyrıntılı hata için aşağıdaki test çıktısını ve Render günlüklerini kontrol et.';
  return 'Otomatik testler başarısız oldu (çıkış kodu: ' + (result.code ?? 'yok') + ').'
    + (details ? ' ' + details + '.' : '') + failures;
}


client.once(Events.ClientReady, readyClient => {
  console.log('Frieren AI agent online as ' + readyClient.user.tag);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!admins.has(interaction.user.id)) {
    await interaction.reply({ content: 'Bu komut yalnızca yetkili geliştiriciler tarafından kullanılabilir.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'frieren-test') {
    const lockKey = interaction.guildId || interaction.user.id;
    if (runningGuilds.has(lockKey)) {
      await interaction.reply({ content: 'Bu ortamda bir test zaten çalışıyor. Lütfen bitmesini bekle.', ephemeral: true });
      return;
    }

    runningGuilds.add(lockKey);
    await interaction.deferReply({ ephemeral: true });
    try {
      const result = await runTests();
      const report = [
        'Exit code: ' + (result.code ?? 'none'),
        'Timed out: ' + result.timedOut,
        'STDOUT:',
        result.stdout,
        'STDERR:',
        result.stderr,
      ].join('\n');
      const summary = buildLocalTestSummary(result);
      const status = result.code === 0 ? 'TESTLER BAŞARILI' : result.timedOut ? 'TEST ZAMAN AŞIMI' : 'TESTLER BAŞARISIZ';
      const rawOutput = (result.stdout + '\n' + result.stderr).trim().slice(-950) || '(Test çıktısı boş.)';
      const body = '**' + status + '**\n\n' + summary + '\n\nTest çıkış kodu: ' + (result.code ?? 'yok') + '\nSon test çıktısı:\n' + rawOutput;
      await interaction.editReply(body.slice(0, 1950));
    } catch (error) {
      console.error('Test command failed:', error.message);
      await interaction.editReply('Test çalıştırılırken hata oluştu. Ayrıntılar servis günlüklerine yazıldı.');
    } finally {
      runningGuilds.delete(lockKey);
    }
    return;
  }



});

client.on(Events.Error, error => console.error('Discord client error:', error.message));

try {
  // Register commands on startup so fresh deployments do not depend on a manual step.
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commandRoute = process.env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
  await rest.put(commandRoute, { body: commands });
  console.log(process.env.DISCORD_GUILD_ID
    ? 'Frieren AI slash commands registered for the configured guild.'
    : 'Frieren AI global slash commands registered.');
} catch (error) {
  // Keep the process available for diagnostics; already-registered commands may still work.
  console.error('Slash command registration failed:', error.message);
}

try {
  await client.login(process.env.DISCORD_TOKEN);
} catch (error) {
  console.error('Discord login failed:', error.message);
  process.exit(1);
}
