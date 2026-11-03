import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { pool, ensureUser } from './database/db.js';
import { levelForXp } from './utils.js';

const MILESTONES = [
  {key:'dungeon-5',wins:5,label:'İlk Beş Zindan',coins:250,xp:100,item:'💎 Mana Kristali'},
  {key:'dungeon-10',wins:10,label:'On Zindan Ustası',coins:600,xp:250,item:'🐉 Ejderha Pulu'},
  {key:'dungeon-25',wins:25,label:'Kuzey Zindan Efsanesi',coins:1500,xp:750,item:'👑 Himmel’in Efsanevi Yadigârı'}
];

export default {
  data:new SlashCommandBuilder()
    .setName('zindanodulleri')
    .setDescription('Kazandığın zindan kilometre taşı ödüllerini tek seferlik olarak al.'),
  async execute(interaction) {
    if(!interaction.guildId) return interaction.reply({content:'Bu komut yalnızca sunucularda kullanılabilir.',flags:MessageFlags.Ephemeral});
    await ensureUser(interaction.guildId,interaction.user.id);
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      const playerResult=await db.query(
        'SELECT coins,xp,level,dungeon_wins FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
        [interaction.guildId,interaction.user.id]
      );
      const player=playerResult.rows[0];
      const claimed=[];
      for(const milestone of MILESTONES.filter(value=>Number(player.dungeon_wins)>=value.wins)) {
        const inserted=await db.query(
          'INSERT INTO dungeon_milestone_claims(guild_id,user_id,milestone_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING milestone_key',
          [interaction.guildId,interaction.user.id,milestone.key]
        );
        if(inserted.rowCount) claimed.push(milestone);
      }
      if(!claimed.length) {
        await db.query('COMMIT');
        const next=MILESTONES.find(value=>Number(player.dungeon_wins)<value.wins);
        return interaction.reply({
          content:next
            ? `Henüz alınabilir zindan kilometre taşı ödülün yok. Sonraki ödül: **${next.wins} zindan zaferi** (${Number(player.dungeon_wins)}/${next.wins}).`
            :'Tüm zindan kilometre taşı ödüllerini daha önce aldın.',
          flags:MessageFlags.Ephemeral
        });
      }
      const totalCoins=claimed.reduce((sum,value)=>sum+value.coins,0);
      const totalXp=claimed.reduce((sum,value)=>sum+value.xp,0);
      const newXp=Number(player.xp)+totalXp;
      const newLevel=levelForXp(newXp);
      await db.query(
        'UPDATE users SET coins=coins+$3,xp=$4,level=$5,stat_points=stat_points+$6 WHERE guild_id=$1 AND user_id=$2',
        [interaction.guildId,interaction.user.id,totalCoins,newXp,newLevel,Math.max(0,newLevel-Number(player.level))]
      );
      for(const milestone of claimed) {
        await db.query(
          'INSERT INTO inventory(guild_id,user_id,item_key,quantity) VALUES($1,$2,$3,1) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=inventory.quantity+1',
          [interaction.guildId,interaction.user.id,milestone.item]
        );
      }
      await db.query('COMMIT');
      const embed=new EmbedBuilder()
        .setColor(0x9b8cff)
        .setTitle('🏆 Zindan Kilometre Taşı Ödülleri')
        .setDescription(claimed.map(value=>`**${value.label}** — +${value.coins} altın · +${value.xp} XP · ${value.item}`).join('\n'))
        .addFields({name:'Toplam kazanım',value:`+**${totalCoins}** altın · +**${totalXp}** XP`})
        .setFooter({text:'Her kilometre taşı ödülü oyuncu başına yalnızca bir kez alınabilir.'});
      return interaction.reply({embeds:[embed],flags:MessageFlags.Ephemeral});
    } catch(error) {
      await db.query('ROLLBACK').catch(()=>{});
      console.error('/zindanodulleri hatası:',error);
      return interaction.reply({content:'Zindan ödülleri alınamadı. Daha sonra tekrar dene.',flags:MessageFlags.Ephemeral});
    } finally { db.release(); }
  }
};
