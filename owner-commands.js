const OWNER_ID = '1553794496234262641';
const PREFIX = '!sahip';

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [days ? days + 'g' : null, hours ? hours + 's' : null, minutes ? minutes + 'd' : null, seconds + 'sn']
    .filter(Boolean)
    .join(' ');
}

export async function handleOwnerMessage(client, message) {
  if (!message || message.author?.bot) return false;

  // Sahip komutları sadece sahibin botla yaptığı DM konuşmasında işlenir.
  // Sunucu mesajlarında komutlar hiçbir işlem yapmaz.
  if (message.guildId || message.author.id !== OWNER_ID) return false;
  if (!message.content?.trim().toLowerCase().startsWith(PREFIX)) return false;

  const parts = message.content.trim().slice(PREFIX.length).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const subcommand = parts[0] || 'yardım';

  if (subcommand === 'yardım' || subcommand === 'yardim' || subcommand === 'help') {
    await message.reply([
      '🥐 **Poğaça Frieren • Sahip Komutları**',
      '',
      '!sahip yardım — Bu yardım listesini gösterir.',
      '!sahip durum — Bot bağlantı durumu, gecikme ve çalışma süresi.',
      '!sahip sunucular — Botun bulunduğu sunucuları ve üye sayılarını özel DM’de listeler.',
      '',
      '🔒 Bu komutlar yalnızca bot sahibi hesabının DM konuşmasında çalışır.'
    ].join('\n'));
    return true;
  }

  if (subcommand === 'durum' || subcommand === 'status') {
    const uptime = client.uptime ?? 0;
    await message.reply([
      '🥐 **Poğaça Frieren • Durum Raporu**',
      'Bağlantı: ' + (client.isReady() ? '✅ Aktif' : '⚠️ Hazır değil'),
      'Bot: ' + (client.user?.tag ?? 'Bilinmiyor'),
      'Gecikme: ' + (Number.isFinite(client.ws.ping) ? Math.round(client.ws.ping) + ' ms' : 'Ölçülemiyor'),
      'Çalışma süresi: ' + formatDuration(uptime),
      'Sunucu sayısı: ' + client.guilds.cache.size
    ].join('\n'));
    return true;
  }

  if (subcommand === 'sunucular' || subcommand === 'servers') {
    const guilds = [...client.guilds.cache.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map((guild, index) => (index + 1) + '. **' + guild.name.replace(/([*_~|])/g, '\\$1') + '** — ' +
        (guild.memberCount ?? 'Bilinmiyor') + ' üye (ID: ' + guild.id + ')');
    const lines = ['🥐 **Botun bulunduğu sunucular: ' + guilds.length + '**', ...(guilds.length ? guilds : ['Bot henüz bir sunucuda değil.'])];
    let chunk = '';
    for (const line of lines) {
      if ((chunk + '\n' + line).length > 1800) {
        await message.channel.send(chunk);
        chunk = line;
      } else {
        chunk = chunk ? chunk + '\n' + line : line;
      }
    }
    if (chunk) await message.channel.send(chunk);
    return true;
  }

  await message.reply('Bu sahip komutu tanınmadı. !sahip yardım yazarak komut listesini görebilirsin.');
  return true;
}
