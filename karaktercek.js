import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
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
    if (!interaction.guildId) return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',ephemeral:true});
    await interaction.deferReply();
    const { guildId, user } = interaction;
    try {
      await ensureUser(guildId,user.id);
      const db = await pool.connect();
      try {
      await db.query('BEGIN');
      const claim = await db.query(`
        UPDATE users SET last_free_character_at=NOW(),
          pity_count=CASE WHEN pity_count >= 9 THEN 0 ELSE pity_count+1 END
        WHERE guild_id=$1 AND user_id=$2
          AND (last_free_character_at IS NULL OR last_free_character_at <= NOW()-INTERVAL '24 hours')
        RETURNING pity_count
      `,[guildId,user.id]);
      if (!claim.rowCount) {
        const next = await db.query(`
          SELECT GREATEST(0,CEIL(EXTRACT(EPOCH FROM (last_free_character_at+INTERVAL '24 hours'-NOW()))))::int AS seconds
          FROM users WHERE guild_id=$1 AND user_id=$2
        `,[guildId,user.id]);
        const secs=next.rows[0]?.seconds ?? 0;
        await db.query('ROLLBACK');
        return interaction.editReply('⏳ Ücretsiz karakter hakkın yenilenmedi. Yaklaşık **'+Math.floor(secs/3600)+' sa. '+Math.ceil((secs%3600)/60)+' dk.** sonra tekrar dene.');
      }
      const pity=Number(claim.rows[0].pity_count);
      const guaranteed=pity===0;
      const character=drawCharacter(null,guaranteed);
      const saved=await saveCharacter(db,guildId,user.id,character);
      await db.query('UPDATE users SET pity_count=$3 WHERE guild_id=$1 AND user_id=$2',[guildId,user.id,character.rarity==='Efsanevi'?0:pity]);
      await db.query('COMMIT');
      const stars={Yaygın:'⭐',Nadir:'⭐⭐',Destansı:'⭐⭐⭐',Efsanevi:'🌟🌟🌟🌟'};
      const embed=new EmbedBuilder().setColor(character.color)
        .setAuthor({name:'✧ '+character.rarity.toLocaleUpperCase('tr-TR')+' ✧'})
        .setTitle(character.emoji+' '+character.name+' '+character.emoji)
        .setDescription('**'+user.username+'**, günlük ücretsiz keşfin tamamlandı!\n\n'+character.description+'\n\n'+character.traits)
        .addFields(
          {name:'🎬 Anime',value:character.anime,inline:true},
          {name:'✨ Nadirlik',value:character.rarity+' '+stars[character.rarity],inline:true},
          {name:'📚 Koleksiyon kopyası',value:'×'+saved,inline:true},
          {name:'🍀 Garanti sistemi',value:character.rarity==='Efsanevi'?'Efsanevi karakter geldi; sayaç sıfırlandı!':'Efsanevi garantiye '+Math.max(0,10-pity)+' hak kaldı.',inline:false}
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
