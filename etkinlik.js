import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { pool } from './database/db.js';
import { createGuildEvent, listGuildEvents, joinGuildEvent, leaveGuildEvent } from './adventurer-platform.js';
import { checkInGuildEvent } from './player-experience.js';
import { createGuildTeam, joinGuildTeam, listGuildTeams, createGuildTeamLeague, registerGuildTeamForLeague, scheduleGuildTeamLeague, reportGuildTeamFixtureScore, getGuildTeamLeagueDashboard } from './guild-team-leagues.js';

const OWNER_ID = '1553794496234262641';
const dateText = value => new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
const eventTypeLabel = type => ({ boss_raid: 'Boss / Raid', tournament: 'Takım Turnuvası', anime_night: 'Anime Gecesi' })[type] || 'Topluluk';

export default {
  data: new SlashCommandBuilder()
    .setName('etkinlik')
    .setDescription('Sunucu macera etkinliklerinin takvimini yönet.')
    .addSubcommand(command => command.setName('liste').setDescription('Yaklaşan etkinlikleri göster.'))
    .addSubcommand(command => command.setName('takim-olustur').setDescription('Yeni lonca takımı kur.').addStringOption(option => option.setName('ad').setDescription('Takım adı').setMaxLength(32).setRequired(true)))
    .addSubcommand(command => command.setName('takimlar').setDescription('Sunucudaki takımları ve kadrolarını listele.'))
    .addSubcommand(command => command.setName('takim-katil').setDescription('Bir takıma katıl.').addStringOption(option => option.setName('takim').setDescription('Takım UUID').setRequired(true)))
    .addSubcommand(command => command.setName('lig-olustur').setDescription('Yeni sezon ligi oluştur.').addStringOption(option => option.setName('ad').setDescription('Sezon adı').setMaxLength(80).setRequired(true)).addStringOption(option => option.setName('baslangic').setDescription('ISO başlangıç tarihi').setRequired(true)).addStringOption(option => option.setName('bitis').setDescription('ISO bitiş tarihi').setRequired(true)))
    .addSubcommand(command => command.setName('lig-kayit').setDescription('Kaptanı olduğun takımı lige kaydet.').addStringOption(option => option.setName('lig').setDescription('Lig UUID').setRequired(true)).addStringOption(option => option.setName('takim').setDescription('Takım UUID').setRequired(true)))
    .addSubcommand(command => command.setName('lig-fikstur').setDescription('Ligin çift devre olmayan round-robin fikstürünü oluştur.').addStringOption(option => option.setName('lig').setDescription('Lig UUID').setRequired(true)).addStringOption(option => option.setName('baslangic').setDescription('İlk maçın ISO tarihi').setRequired(true)).addIntegerOption(option => option.setName('aralik').setDescription('Turlar arası gün').setMinValue(1).setMaxValue(30)))
    .addSubcommand(command => command.setName('lig-durum').setDescription('Lig puan tablosu ve sezon fikstürünü görüntüle.').addStringOption(option => option.setName('lig').setDescription('Lig UUID').setRequired(true)))
    .addSubcommand(command => command.setName('lig-skor').setDescription('Takım kaptanı olarak maç sonucunu bildir.').addStringOption(option => option.setName('mac').setDescription('Maç UUID').setRequired(true)).addStringOption(option => option.setName('takim').setDescription('Takım UUID').setRequired(true)).addIntegerOption(option => option.setName('skor').setDescription('Kendi takımının skoru').setMinValue(0).setMaxValue(99).setRequired(true)).addIntegerOption(option => option.setName('rakip_skor').setDescription('Rakip takımın skoru').setMinValue(0).setMaxValue(99).setRequired(true)))
    .addSubcommand(command => command.setName('katil').setDescription('Bir etkinliğe katıl.').addStringOption(option => option.setName('id').setDescription('Etkinlik kimliği').setRequired(true)).addStringOption(option => option.setName('takim').setDescription('Boss/raid için üyesi olduğun takımın UUID değeri')))
    .addSubcommand(command => command.setName('ayril').setDescription('Bir etkinlikten ayrıl.').addStringOption(option => option.setName('id').setDescription('Etkinlik kimliği').setRequired(true)))
    .addSubcommand(command => command.setName('yoklama').setDescription('Başlamış etkinlikte katılımını doğrula.').addStringOption(option => option.setName('id').setDescription('Etkinlik kimliği').setRequired(true)))
    .addSubcommand(command => command.setName('olustur').setDescription('Yeni topluluk etkinliği oluştur (yalnızca bot sahibi).')
      .addStringOption(option => option.setName('baslik').setDescription('Etkinlik başlığı').setMaxLength(100).setRequired(true))
      .addStringOption(option => option.setName('baslangic').setDescription('ISO tarih/saat, ör. 2026-11-10T20:00:00+03:00').setRequired(true))
      .addStringOption(option => option.setName('bitis').setDescription('ISO tarih/saat ve saat dilimi').setRequired(true))
      .addStringOption(option => option.setName('aciklama').setDescription('Etkinlik açıklaması').setMaxLength(1000))
      .addStringOption(option => option.setName('tur').setDescription('Etkinlik türü').addChoices({ name: 'Topluluk', value: 'community' }, { name: 'Boss / Raid', value: 'boss_raid' }, { name: 'Takım Turnuvası', value: 'tournament' }, { name: 'Anime Gecesi', value: 'anime_night' }))
      .addIntegerOption(option => option.setName('kapasite').setDescription('En fazla katılımcı (boş: sınırsız)').setMinValue(1).setMaxValue(500))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Etkinlikler yalnızca sunucularda kullanılabilir.', flags: MessageFlags.Ephemeral });
    const action = interaction.options.getSubcommand();
    const teamInput={guildId:interaction.guildId,userId:interaction.user.id};
    if(action==='takim-olustur'){
      const result=await createGuildTeam(pool,{guildId:interaction.guildId,captainId:interaction.user.id,name:interaction.options.getString('ad')});
      return interaction.reply({content:result.status==='created'?'Takım kuruldu: **'+result.team.team_name+'** · UUID: `'+result.team.team_id+'`':result.status==='already_in_team'?'Zaten bir takımdasın.':'Bu takım adı kullanılıyor.',flags:MessageFlags.Ephemeral});
    }
    if(action==='takimlar'){
      const teams=await listGuildTeams(pool,interaction.guildId);
      return interaction.reply({content:teams.length?teams.map(t=>'• **'+t.team_name+'** · '+t.member_count+'/10 · UUID: `'+t.team_id+'`').join('\\n'):'Henüz takım kurulmamış.',flags:MessageFlags.Ephemeral});
    }
    if(action==='takim-katil'){
      const result=await joinGuildTeam(pool,{...teamInput,teamId:interaction.options.getString('takim')});
      const messages={joined:'Takıma katıldın.',already_joined:'Zaten bu takımdasın.',already_in_team:'Başka bir takımın üyesisin.',team_full:'Takım 10 oyuncuya ulaştı.',not_found:'Takım bulunamadı.'};
      return interaction.reply({content:messages[result.status]||'Takım kaydı tamamlanamadı.',flags:MessageFlags.Ephemeral});
    }
    if(action==='lig-olustur'){
      const league=await createGuildTeamLeague(pool,{guildId:interaction.guildId,creatorId:interaction.user.id,name:interaction.options.getString('ad'),startsAt:interaction.options.getString('baslangic'),endsAt:interaction.options.getString('bitis')});
      return interaction.reply({content:'Sezon ligi oluşturuldu: **'+league.season_name+'** · UUID: `'+league.league_id+'`',flags:MessageFlags.Ephemeral});
    }
    if(action==='lig-kayit'){
      const result=await registerGuildTeamForLeague(pool,{guildId:interaction.guildId,teamId:interaction.options.getString('takim'),leagueId:interaction.options.getString('lig'),actorId:interaction.user.id});
      return interaction.reply({content:result.status==='registered'?'Takım lige kaydedildi.':'Kayıt başarısız: takım kaptanı olmalı ve lig kayıt kabul etmeli.',flags:MessageFlags.Ephemeral});
    }
    if(action==='lig-fikstur'){
      const result=await scheduleGuildTeamLeague(pool,{guildId:interaction.guildId,leagueId:interaction.options.getString('lig'),actorId:interaction.user.id,startsAt:interaction.options.getString('baslangic'),intervalDays:interaction.options.getInteger('aralik')||7});
      return interaction.reply({content:result.status==='scheduled'?'Fikstür oluşturuldu: **'+result.fixtureCount+' maç**.':'Fikstür oluşturulamadı: '+result.status,flags:MessageFlags.Ephemeral});
    }
    if(action==='lig-durum'){
      const data=await getGuildTeamLeagueDashboard(pool,interaction.guildId,interaction.options.getString('lig'));
      if(!data)return interaction.reply({content:'Lig bulunamadı.',flags:MessageFlags.Ephemeral});
      const table=data.table.map((t,i)=>(i+1)+'. **'+t.team_name+'** · '+t.points+' puan · '+t.wins+'G '+t.draws+'B '+t.losses+'M · AV '+t.goal_difference).join('\\n');
      const fixtures=data.fixtures.slice(0,15).map(x=>'Tur '+x.round_number+': **'+x.home_team+'** - **'+x.away_team+'** · '+dateText(x.scheduled_at)+' · '+x.status+(x.home_score===null?'':' · '+x.home_score+'-'+x.away_score)).join('\\n');
      return interaction.reply({content:'**'+data.league.season_name+'** · '+data.league.status+'\\n**Puan Tablosu**\\n'+(table||'Kayıtlı takım yok.')+'\\n**Fikstür**\\n'+(fixtures||'Henüz fikstür yok.'),flags:MessageFlags.Ephemeral});
    }
    if(action==='lig-skor'){
      const result=await reportGuildTeamFixtureScore(pool,{guildId:interaction.guildId,fixtureId:interaction.options.getString('mac'),teamId:interaction.options.getString('takim'),actorId:interaction.user.id,ownScore:interaction.options.getInteger('skor'),opponentScore:interaction.options.getInteger('rakip_skor')});
      const messages={awaiting_confirmation:'Sonuç kaydedildi; rakip takım kaptanının aynı sonucu bildirmesi bekleniyor.',completed:'İki takım da sonucu doğruladı. Puan tablosu güncellendi.',disputed:'Takımların skor bildirimleri uyuşmuyor. Sonuç inceleme gerektiriyor.',captain_required:'Bu işlem yalnızca takım kaptanına açık.',not_participant:'Takım bu maçta yer almıyor.',unavailable:'Maç kapalı veya sonuçlandırılmış.',not_found:'Maç bulunamadı.'};
      return interaction.reply({content:messages[result.status]||'Skor bildirilemedi.',flags:MessageFlags.Ephemeral});
    }
    if (action === 'liste') {
      const events = await listGuildEvents(pool, interaction.guildId, 15);
      const lines = events.map(event => `• **${event.title}** — ${dateText(event.starts_at)} · ${event.participants}${event.max_participants ? '/'+event.max_participants : ''} kişi\n  ${eventTypeLabel(event.event_type)} · ID: \`${event.event_id}\`\n  ${event.description || 'Açıklama yok.'}`);
      return interaction.reply({ content: `**Yaklaşan Macera Etkinlikleri**\n${lines.join('\n') || 'Henüz planlanmış etkinlik yok.'}`, flags: MessageFlags.Ephemeral });
    }
    const eventId = interaction.options.getString('id');
    if (action === 'katil') {
      const result = await joinGuildEvent(pool, { guildId: interaction.guildId, eventId, userId: interaction.user.id, teamId: interaction.options.getString('takim') || null });
      const messages = { joined: result.teamName ? 'Boss/raid kaydın **'+result.teamName+'** takımına oluşturuldu.' : 'Etkinliğe kaydın oluşturuldu.', team_required: 'Boss/raid etkinliği için önce bir lonca takımı kur veya katıl, sonra takım UUID’sini seç.', not_team_member: 'Bu takımın üyesi değilsin.', team_full: 'Seçtiğin raid takımı dolu.', team_not_supported: 'Bu etkinlik türünde takım seçimi desteklenmiyor.', already_joined: 'Bu etkinliğe zaten kayıtlısın.', full: 'Etkinlik kapasitesi doldu.', unavailable: 'Etkinlik bulunamadı veya kayıt süresi kapandı.' };
      return interaction.reply({ content: messages[result.status] || 'Kayıt tamamlanamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'yoklama') {
      const result = await checkInGuildEvent(pool, { guildId: interaction.guildId, eventId, userId: interaction.user.id });
      const messages = { checked_in: 'Etkinlik katılımın doğrulandı. Etkinlik bitince /yasam etkinlik-odul ile ödülünü alabilirsin.', already_checked_in: 'Bu etkinlikte yoklaman zaten alındı.', not_eligible: 'Yoklama yalnızca kayıtlı katılımcılara, etkinlik başladıktan sonra açıktır.', invalid_event: 'Etkinlik kimliği geçersiz.' };
      return interaction.reply({ content: messages[result.status] || 'Yoklama alınamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'ayril') {
      const result = await leaveGuildEvent(pool, { guildId: interaction.guildId, eventId, userId: interaction.user.id });
      return interaction.reply({ content: result.removed ? 'Etkinlik kaydın silindi.' : 'Aktif bir etkinlik kaydın bulunamadı.', flags: MessageFlags.Ephemeral });
    }
    if (action === 'olustur') {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'Bu işlem yalnızca bot sahibine açıktır.', flags: MessageFlags.Ephemeral });
      try {
        const result = await createGuildEvent(pool, {
          guildId: interaction.guildId,
          createdBy: interaction.user.id,
          title: interaction.options.getString('baslik'),
          startsAt: interaction.options.getString('baslangic'),
          endsAt: interaction.options.getString('bitis'),
          description: interaction.options.getString('aciklama') || '',
          eventType: interaction.options.getString('tur') || 'community',
          maxParticipants: interaction.options.getInteger('kapasite'),
          channelId: interaction.channelId
        });
        return interaction.reply({ content: `Etkinlik oluşturuldu. Başlangıçtan 30 dakika önce bu kanalda hatırlatma gönderilecek. Kimlik: \`${result.eventId}\`\nKayıtlar **/etkinlik katil** ile açıldı.`, flags: MessageFlags.Ephemeral });
      } catch (error) {
        if (error.message === 'EVENT_INPUT_INVALID') return interaction.reply({ content: 'Başlık ve tarihleri kontrol et. Başlangıç gelecekte olmalı; bitiş başlangıçtan sonra gelmeli ve ISO 8601 saat dilimi içermeli.', flags: MessageFlags.Ephemeral });
        if (error.message === 'EVENT_TYPE_INVALID') return interaction.reply({ content: 'Etkinlik türü geçersiz.', flags: MessageFlags.Ephemeral });
        throw error;
      }
    }
    return interaction.reply({ content: 'Bilinmeyen etkinlik işlemi.', flags: MessageFlags.Ephemeral });
  }
};
