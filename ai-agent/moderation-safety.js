export function checkModerationPermissions(interaction, permissionBit) {
  if (!interaction?.guildId || !interaction?.guild) {
    return { ok: false, reason: 'Bu komut yalnızca sunucuda kullanılabilir.' };
  }
  if (!interaction.memberPermissions?.has(permissionBit)) {
    return { ok: false, reason: 'Bu işlem için gerekli moderasyon iznine sahip değilsin.' };
  }
  const botPermissions = interaction.guild.members?.me?.permissions;
  if (!botPermissions?.has(permissionBit)) {
    return { ok: false, reason: 'Botun gerekli izni yok. Sunucu rol izinlerini kontrol et.' };
  }
  return { ok: true, reason: '' };
}
