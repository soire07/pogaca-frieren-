import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { drawCharacter } from './character-data.js';

async function saveCharacter(db, guildId, userId, c) {
  const result = await db.query(`
    INSERT INTO anime_character_collection
      (guild_id, user_id, character_name, anime, rarity, emoji, color, description, traits, image)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (guild_id, user_id, character_name)
    DO UPDATE SET quantity = anime_character_collection.quantity + 1,
      anime = EXCLUDED.anime, rarity = EXCLUDED.rarity, emoji = EXCLUDED.emoji,
      color = EXCLUDED.color, description = EXCLUDED.description,
      traits = EXCLUDED.traits, image = EXCLUDED.image, last_obtained_at = NOW()
    RETURNING quantity
  `, [guildId,userId,c.name,c.anime,c.rarity,c.emoji,c.color,c.description,c.traits,c.image]);
  return result.rows[0].quantity;
}
export default {
  data: new SlashCommandBuilder().setName('karaktercek').setDescription('Her 24 saatte bir ücretsiz anime karakteri keşfet.'),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',flags: MessageFlags.Ephemeral});
    await interaction.deferReply();
    const { guildId, user } = interaction;
    try {
      await ensureUser(guildId,user.id);
      const db = await pool.connect();
      try {
      await db.query('BEGIN');
      const userState = await db.query(
        'SELECT last_free_character_at, free_character_pity_count FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [guildId,user.id]
      );
      const state = userState.rows[0];
      if (state.last_free_character_at && new Date(state.last_free_character_at).getTime() > Date.now() - 24 * 60 * 60 * 1000) {
        const secs = Math.max(0, Math.ceil((new Date(state.last_free_character_at).getTime() + 24 * 60 * 60 * 1000 - Date.now()) / 1000));
        await db.query('ROLLBACK');
        return interaction.editReply('⏳ Ücretsiz karakter hakkın yenilenmedi. Yaklaşık **'+Math.floor(secs/3600)+' sa. '+Math.ceil((secs%3600)/60)+' dk.** sonra tekrar dene.');
      }
      const previousPity = Number(state.free_character_pity_count || 0);
      await db.query(
        'UPDATE users SET last_free_character_at=NOW() WHERE guild_id=$1 AND user_id=$2',
        [guildId,user.id]
      );
      const guaranteed = previousPity >= 9;
      const character=drawCharacter(null,false,guaranteed);
      const saved=await saveCharacter(db,guildId,user.id,character);
      await db.query('UPDATE users SET free_character_pity_count=$3 WHERE guild_id=$1 AND user_id=$2',[guildId,user.id,character.rarity==='Efsanevi'?0:previousPity+1]);
      await db.query('COMMIT');
      const stars={Yaygın:'⭐',Nadir:'⭐⭐',Destansı:'⭐⭐⭐',Efsanevi:'🌟🌟🌟🌟',Gizemli:'🌌✨🌌✨🌌'};
      const embed=new EmbedBuilder().setColor(character.color)
        .setAuthor({name:'✧ '+character.rarity.toLocaleUpperCase('tr-TR')+' ✧'})
        .setTitle(character.emoji+' '+character.name+' '+character.emoji)
        .setDescription('**'+user.username+'**, günlük ücretsiz keşfin tamamlandı!\n\n'+character.description+'\n\n'+character.traits)
        .addFields(
          {name:'🎬 Anime',value:character.anime,inline:true},
          {name:'✨ Nadirlik',value:character.rarity+' '+stars[character.rarity],inline:true},
          {name:'📚 Koleksiyon kopyası',value:'×'+saved,inline:true},
          {name:'🍀 Garanti sistemi',value:character.rarity==='Efsanevi'?'Efsanevi karakter geldi; sayaç sıfırlandı!':'Efsanevi garantiye '+Math.max(0,9-previousPity)+' hak kaldı.',inline:false}
        ).setFooter({text:'Poğaça Frieren • Ücretsiz günlük karakter'}).setTimestamp();
      if(character.image) embed.setImage(character.image);
      return interaction.editReply({embeds:[embed]});
      } catch(error) {
        await db.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        db.release();
      }
    } catch(error) {
      console.error('Karaktercek komutu hatası:',error);
      return interaction.editReply('Ücretsiz karakter alınırken hata oluştu. Daha sonra tekrar dene.');
    }
  }
};
