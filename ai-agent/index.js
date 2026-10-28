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
  new SlashCommandBuilder()
    .setName('frieren-test')
    .setDescription('Yazdığın hedefi dikkate alarak Frieren otomatik test ve tanılama paketini çalıştırır.')
    .addStringOption(option => option.setName('hedef').setDescription('Neyi test etmemi istiyorsun? Örn. boss hasarı, görev ödülleri, envanter.') .setRequired(true).setMaxLength(500))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('frieren-ai')
    .setDescription('Frieren botunun kodu ve test sistemi hakkında yapay zekâya soru sorar.')
    .addStringOption(option => option.setName('soru').setDescription('Sorunu veya inceleme isteğini yaz.').setRequired(true).setMaxLength(1500))
    .toJSON(),
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


async function runSyntaxChecks() {
  const files = ['ai-agent/index.js', 'ai-agent/register-commands.js'];
  const results = await Promise.all(files.map(file => new Promise(resolve => {
    const child = spawn('node', ['--check', file], {
      cwd: rootDir, shell: false, windowsHide: true,
      env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code, error = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ file, code, stdout, stderr: stderr + error });
    };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-2000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.on('error', error => finish(null, error.message));
    child.on('close', code => finish(code));
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(null, 'Syntax check timed out'); }, timeoutMs);
  })));
  return {
    code: results.every(result => result.code === 0) ? 0 : 1,
    stdout: results.map(result => result.file + ': ' + (result.code === 0 ? 'OK' : 'FAILED')).join('\\n'),
    stderr: results.filter(result => result.code !== 0).map(result => result.file + ': ' + result.stderr).join('\\n'),
  };
}

function runCommandAudit() {
  return new Promise(resolve => {
    const child = spawn('node', ['scripts/audit-command-contracts.js'], {
      cwd: rootDir,
      shell: false,
      windowsHide: true,
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code, error = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr + error),
      });
    };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-12000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-12000); });
    child.on('error', error => finish(null, '\\n' + error.message));
    child.on('close', code => finish(code));
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(null, '\\nKomut denetimi zaman aşımına uğradı.'); }, timeoutMs);
  });
}

function runTargetedTests(target) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['scripts/test-request.js', target], {
      cwd: rootDir, shell: false, windowsHide: true,
      env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code, error = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ applicable: true, code, stdout: redactSecrets(stdout), stderr: redactSecrets(stderr + error), note: '' });
    };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-10000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on('error', error => finish(null, error.message));
    child.on('close', code => finish(code));
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(null, 'İstek bazlı test zaman aşımına uğradı.'); }, timeoutMs);
  });
}

function classifyTestTarget(target) {
  const groups = [
    { label: 'Savaş ve RPG mekanikleri', pattern: /sava[sş]|boss|iblis|hasar|savunma|sınıf|sinif|büyü|buyu|mana|şifa|sifa|zindan|ekipman|set bonus|karakter/i },
    { label: 'Görev, ödül ve ilerleme', pattern: /görev|gorev|ödül|odul|xp|deneyim|seviye|level|keşif|kesif|ganimet|zanaat|craft/i },
    { label: 'Komut ve Discord etkileşimleri', pattern: /komut|slash|buton|button|etkileşim|etkilesim|discord|cooldown|bekleme süresi|rol/i },
    { label: 'Envanter ve ekonomi', pattern: /envanter|eşya|esya|altın|altin|para|market|pazar|satın|satin|satış|satis/i },
  ];
  const matched = groups.filter(group => group.pattern.test(target)).map(group => group.label);
  return matched.length ? matched : ['Genel otomatik denetim'];
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
      + ' Bu sonuç yalnızca çalıştırılan otomatik testleri kapsar; canlı sunucudaki tüm komutların sorunsuz olduğunu tek başına kanıtlamaz.';
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
  console.log('Frieren bot test service online as ' + readyClient.user.tag);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!admins.has(interaction.user.id)) {
    await interaction.reply({ content: 'Bu komut yalnızca yetkili geliştiriciler tarafından kullanılabilir.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.commandName === 'frieren-test') {
    const target = interaction.options.getString('hedef', true).trim();
    const targetGroups = classifyTestTarget(target);
    const lockKey = interaction.guildId || interaction.user.id;
    if (runningGuilds.has(lockKey)) {
      await interaction.reply({ content: 'Bu ortamda bir test zaten çalışıyor. Lütfen bitmesini bekle.', ephemeral: true });
      return;
    }

    runningGuilds.add(lockKey);
    await interaction.deferReply({ ephemeral: true });
    try {
      const [agentSyntax, audit, result, targeted] = await Promise.all([
        runSyntaxChecks(),
        runCommandAudit(),
        runTests(),
        runTargetedTests(target),
      ]);
      const auditOutput = audit.stdout + '\n' + audit.stderr;
      const commandCount = auditOutput.match(/ÖZET: (\d+) komut keşfedildi; (\d+) PASS; (\d+) FAIL/);
      const commandList = auditOutput.split(/\r?\n/).filter(line => /^(?:PASS|FAIL) \//.test(line)).slice(0, 8).join(', ') || '';
      const auditPassed = audit.code === 0 && Boolean(commandCount) && Number(commandCount[3]) === 0;
      const syntaxPassed = agentSyntax.code === 0;
      const testsPassed = result.code === 0 && !result.timedOut;
      const status = auditPassed && testsPassed && syntaxPassed ? 'TÜM OTOMATİK DENETİMLER BAŞARILI' : result.timedOut ? 'TEST ZAMAN AŞIMI' : 'DENETİM BAŞARISIZ';
      const summary = buildLocalTestSummary(result);
      const targetedOutput = (targeted.stdout || '') + '\\n' + (targeted.stderr || '');
      const targetedHasTests = /SEÇİLEN TEST DOSYALARI:/.test(targetedOutput);
      const targetedSummary = targeted.applicable
        ? (!targetedHasTests
          ? 'Hedefe özel test kapsamı: BULUNAMADI. İstekle eşleşen test dosyası seçilmedi; bu hedef için başarı iddiası verilmiyor.'
          : targeted.code === 0
            ? 'Hedefe özel testler: BAŞARILI. ' + (targetedOutput.match(/SEÇİLEN TEST DOSYALARI: ([^\\n]+)/)?.[1] || 'Seçilen testler geçti.')
            : 'Hedefe özel testler: BAŞARISIZ (çıkış kodu: ' + (targeted.code ?? 'yok') + '). ' + targetedOutput.slice(-300))
        : 'Hedefe özel test kapsamı: EKSİK. ' + targeted.note;
      const syntaxSummary = syntaxPassed ? 'AI servis sözdizimi: başarılı.' : 'AI servis sözdizimi BAŞARISIZ: ' + agentSyntax.stderr.slice(-250);
      const auditSummary = auditPassed
        ? 'Komut sözleşme denetimi: ' + commandCount[1] + ' komut keşfedildi; ' + commandCount[2] + ' PASS, ' + commandCount[3] + ' FAIL. Her komut için ayrı sonuç üretildi.'
        : 'Komut sözleşme denetimi BAŞARISIZ. Ayrıntılar test çıktısında.';
      const rawOutput = (auditOutput + '\n' + result.stdout + '\n' + result.stderr).trim().slice(-650) || '(Test çıktısı boş.)';
      const body = '**' + status + '**\n\n**İstenen test:** ' + target.slice(0, 500)
        + '\n**İlgili alan:** ' + targetGroups.join(' • ')
        + '\n\n' + auditSummary + '\n' + summary
        + '\n' + targetedSummary
        + '\n\nKapsam notu: Genel paket ile hedefli testler ayrı raporlanır. Hedefli paket yalnızca kapsadığı senaryoları doğrular; canlı Discord etkileşimlerini tek başına kanıtlamaz.'
        + '\nDiscord üzerinde her komutun canlı etkileşimini bu paket tek başına kanıtlamaz.'
        + '\n\nKomutlar: ' + (commandList || 'Ayrıntılı liste test çıktısında yok.')
        + '\nTest çıkış kodu: ' + (testsPassed ? 0 : (result.code ?? 'yok'))
        + '\nSon test çıktısı:\n' + rawOutput;
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
    ? 'Frieren test slash command registered for the configured guild.'
    : 'Frieren test slash command registered globally.');
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
