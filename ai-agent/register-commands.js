import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) {
  console.error('Missing required environment variables: ' + missing.join(', '));
  process.exit(1);
}

const TEST_GUILD_ID = '1564945192803639356';
if (process.env.DISCORD_GUILD_ID.trim() !== TEST_GUILD_ID) {
  console.error('Frieren AI command registration is restricted to the test guild …9356. Global and production-guild registration are disabled.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('frieren-test')
    .setDescription('Yazdığın hedefi dikkate alarak Frieren otomatik test ve tanılama paketini çalıştırır.')
    .addStringOption(option => option.setName('hedef').setDescription('Neyi test etmemi istiyorsun? Örn. boss hasarı, görev ödülleri, envanter.').setRequired(true).setMaxLength(4000))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('frieren-ai')
    .setDescription('Frieren botunun kodu ve test sistemi hakkında yapay zekâya soru sorar.')
    .addStringOption(option => option.setName('soru').setDescription('Sorunu veya inceleme isteğini yaz.').setRequired(true).setMaxLength(1500))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('frieren-bellek')
    .setDescription('Kişisel kalıcı belleğini yönetir.')
    .addSubcommand(subcommand => subcommand.setName('kaydet').setDescription('Bilgiyi kalıcı belleğe kaydet.')
      .addStringOption(option => option.setName('anahtar').setDescription('Kısa kayıt adı').setRequired(true).setMaxLength(60))
      .addStringOption(option => option.setName('bilgi').setDescription('Saklanacak bilgi').setRequired(true).setMaxLength(500)))
    .addSubcommand(subcommand => subcommand.setName('listele').setDescription('Kalıcı bellek kayıtlarını listele.'))
    .addSubcommand(subcommand => subcommand.setName('sil').setDescription('Bir kaydı sil.')
      .addStringOption(option => option.setName('anahtar').setDescription('Silinecek kayıt adı').setRequired(true).setMaxLength(60)))
    .addSubcommand(subcommand => subcommand.setName('temizle').setDescription('Tüm kişisel bellek kayıtlarını sil.')
      .addBooleanOption(option => option.setName('onayla').setDescription('Silme işlemini onayla').setRequired(true)))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('frieren-komut-denetle')
    .setDescription('Poğaça Frieren komut işleyicilerini yalıtılmış veritabanında çalıştırıp raporlar.')
    .addStringOption(option => option.setName('komut').setDescription('Tek bir komut adı (boş bırakırsan tüm komutlar denenir).').setRequired(false).setMaxLength(80))
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const route = Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, TEST_GUILD_ID);

await rest.put(route, { body: commands });
console.log('Frieren AI test-guild commands registered: 4 root commands and 4 /frieren-bellek subcommands.');
