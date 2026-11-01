import { equipmentItems, equipmentSlots } from './equipment-data.js';
import { DAILY_QUEST_OBJECTIVES, DAILY_QUEST_CLASSES } from './owner-rpg-quests.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

export async function getOwnerDatabaseDiagnostics(db) {
  const result = await db.query(`
    SELECT current_database() AS database_name, NOW() AS checked_at,
      current_setting('server_version') AS server_version,
      pg_database_size(current_database())::bigint AS database_size_bytes,
      (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname=current_database() AND state='active') AS active_connections,
      (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname=current_database() AND state='idle') AS idle_connections,
      tables.table_name, COALESCE(stats.n_live_tup,0)::bigint AS row_count
    FROM information_schema.tables AS tables
    LEFT JOIN pg_stat_user_tables AS stats
      ON stats.schemaname=tables.table_schema AND stats.relname=tables.table_name
    WHERE tables.table_schema='public' AND tables.table_type='BASE TABLE'
    ORDER BY tables.table_name LIMIT 40
  `);
  const rows = result.rows || [];
  const first = rows[0] || {};
  return {
    connected: true,
    databaseName: String(first.database_name || ''),
    checkedAt: first.checked_at || null,
    serverVersion: String(first.server_version || ''),
    databaseSizeBytes: Number(first.database_size_bytes || 0),
    activeConnections: Number(first.active_connections || 0),
    idleConnections: Number(first.idle_connections || 0),
    tables: rows.map(row => ({ name: String(row.table_name || ''), rows: Number(row.row_count || 0) }))
  };
}

export function renderOwnerWorkspace(kind, data = {}) {
  const link = (href, label) => '<a class="btn secondary" href="' + href + '">' + label + '</a>';
  const card = (title, description, href, label = 'Aç') =>
    '<article class="panel"><h3>' + title + '</h3><p class="muted">' + description + '</p>' + link(href, label) + '</article>';
  const heading = (title, subtitle) => '<section class="hero"><span class="tag">FRIEREN OWNER · WORKSPACE</span><h1>' + title + '</h1><p class="muted">' + subtitle + '</p></section>';
  if (kind === 'ai') {
    const ai = data.aiReadiness;
    const ready = ai?.status === 'ok' && ai.discordReady === true && ai.memoryDatabaseReady === true && ai.modelConfigured === true;
    const checks = [
      ['Discord bağlantısı', ai?.discordReady],
      ['Hafıza veritabanı', ai?.memoryDatabaseReady],
      ['Model yapılandırması', ai?.modelConfigured]
    ];
    return heading('Frieren AI', 'Kod denetimi, senaryo testi ve kalıcı hafıza için ayrı yönetim alanı.')
      + '<div class="grid"><div class="stat"><small>Genel durum</small><strong class="' + (ready ? 'good' : 'warn') + '">' + (ready ? 'Hazır' : 'Kontrol gerekli') + '</strong></div>'
      + '<div class="stat"><small>İzinli sunucu</small><strong>Test sunucusu</strong><div class="small">1564945192803639356</div></div></div>'
      + '<section class="panel"><h2>Servis kontrolleri</h2>' + checks.map(([label, value]) =>
        '<div class="rowitem"><strong>' + label + '</strong><span class="' + (value === true ? 'good' : 'bad') + '"> · ' + (value === true ? 'Hazır' : value === false ? 'Başarısız' : 'Veri alınamadı') + '</span></div>'
      ).join('') + '<p class="small">Bu ekran yalnızca test sunucusu için sentetik komut senaryoları çalıştırır; gerçek kullanıcı işlemi yapmaz.</p></section>'
      + '<section class="panel"><h2>Poğaça sohbet kişiliği</h2><p class="muted">Bu ayarlar Poğaça Frieren’in etiketle açılan sohbet davranışını etkiler. Frieren AI kod/test ajanının çalışma sunucusu bu ayarlardan bağımsızdır.</p>'
      + (data.notice === 'chat_settings_saved' ? '<p class="notice">Sohbet tercihleri kaydedildi.</p>' : '')
      + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="frieren-chat-settings">'
      + '<label><input type="checkbox" name="enabled" value="yes"' + (data.chatSettings?.enabled !== false ? ' checked' : '') + ' style="display:inline;width:auto"> Etiketle sohbet özelliği açık</label>'
      + '<label>Konuşma tarzı</label><select name="style">'
      + [['calm','Sakin ve düşünceli'],['warm','Sıcak ve nazik'],['witty','İnce mizahlı'],['formal','Resmi ve ölçülü']].map(([value,label]) => '<option value="' + value + '"' + (data.chatSettings?.style === value ? ' selected' : '') + '>' + label + '</option>').join('')
      + '</select><label>Yanıt uzunluğu</label><select name="responseLength">'
      + [['concise','Kısa'],['balanced','Dengeli'],['detailed','Ayrıntılı']].map(([value,label]) => '<option value="' + value + '"' + (data.chatSettings?.responseLength === value ? ' selected' : '') + '>' + label + '</option>').join('')
      + '</select><label><input type="checkbox" name="loreFocus" value="yes"' + (data.chatSettings?.loreFocus !== false ? ' checked' : '') + ' style="display:inline;width:auto"> Frieren anime evrenine öncelik ver</label>'
      + '<button class="btn">Sohbet tercihlerini kaydet</button></form></section>'
      + (data.notice === 'test_saved' ? '<p class="notice">Test sonucu kaydedildi. PASS, FAIL veya TEST EDİLMEDİ durumunu geçmişten inceleyebilirsin.</p>' : '')
      + '<section class="panel"><h2>Komut test çalıştırıcısı</h2><p class="muted">Boş bırakılırsa tüm komutlar denetlenir. Belirli komutları virgül veya satırla ayırarak girebilirsin. Testler sentetik etkileşim kullanır; gerçek Discord kullanıcısı adına işlem yapmaz.</p>'
      + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="ai-test-run">'
      + '<label>Yazdığın test senaryosu veya hedef (isteğe bağlı)</label><textarea name="target" maxlength="4000" placeholder="Örn. Ekipman kuşanıldığında temel HP/Mana değerleri kalıcı değişmemeli; çıkarıldığında eski değerler geri gelmeli."></textarea>'
      + '<label>Komut adları (isteğe bağlı)</label><textarea name="commands" maxlength="2000" placeholder="karakter, bakiye, zindan"></textarea>'
      + '<p class="small">Senaryo metni mevcut test dosyalarıyla eşleştirilir. Eşleşen test bulunamazsa veya hiçbir test gerçekten çalışmazsa sonuç BAŞARILI değil, TEST EDİLMEDİ olarak kaydedilir. PASS yalnızca seçilen testler geçerse verilir; bu, yazdığın senaryonun her ayrıntısının kapsandığı anlamına gelmez. Bu alan kendiliğinden yeni test kodu üretmez.</p>'
      + '<label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Testleri şimdi çalıştırmayı onaylıyorum</label><button class="btn">Testleri çalıştır</button></form>'
      + (data.testRuns?.rows?.length ? '<section class="panel"><h3>Son test çalıştırmaları</h3>' + data.testRuns.rows.map(run => '<div class="rowitem"><div class="actions"><strong>#' + Number(run.id) + ' · ' + escapeHtml(run.target) + '</strong><span class="' + (run.status === 'PASS' ? 'good' : run.status === 'FAIL' ? 'bad' : 'warn') + '">' + escapeHtml(run.status) + '</span></div><div class="small">' + Number(run.summary?.total || 0) + ' test · ' + Number(run.summary?.pass || 0) + ' PASS · ' + Number(run.summary?.fail || 0) + ' FAIL · ' + escapeHtml(new Date(run.created_at).toLocaleString('tr-TR')) + '</div>' + (Array.isArray(run.details?.testFiles) ? '<div class="small">Dosyalar: ' + escapeHtml(run.details.testFiles.join(', ')) + '</div>' : '') + (Array.isArray(run.details?.failedStages) && run.details.failedStages.length ? '<p class="notice warn">' + escapeHtml(run.details.failedStages.join(' · ')) + '</p>' : '') + '</div>').join('') + '<a href="/owner/activity">Tüm denetim ve test geçmişi</a></section>' : '<p class="muted">Henüz kaydedilmiş test çalıştırması yok.</p>') + '</section>'
      + '<div class="columns">' + card('AI hafızası', 'Kayıtlı hafızaları görüntüle ve gerektiğinde sil.', '/owner#memories')
      + card('Teknik talepler', 'Kod değişikliği taleplerini onayla veya reddet.', '/owner#approvals')
      + card('Genel durum', 'Ana kontrol merkezine dön.', '/owner') + '</div>';
  }
  if (kind === 'pogaca') {
    const rpg = data.rpgMetrics || {};
    const players = data.players || [];
    const guildOptions = data.guildOptions || [];
    const selectedGuild = String(data.guildId || '');
    const selectedPlayer = data.player || null;
    const dailyQuests = data.dailyQuests || [];
    const noticeText = data.notice === 'rpg_saved' ? 'Oyuncu kaynakları güncellendi ve işlem denetim kaydına yazıldı.'
      : data.notice === 'rpg_error' ? 'Kaynak güncellemesi yapılamadı. Oyuncuyu, gerekçeyi ve değerleri kontrol et.'
      : data.notice === 'quest_saved' ? 'Görev kaydedildi. Değişiklik denetim kaydına eklendi.'
      : data.notice === 'quest_disabled' ? 'Görev pasife alındı; geçmiş ödül kayıtları korundu.'
      : data.notice === 'quest_error' ? 'Görev işlemi tamamlanamadı. Alanları ve işlem gerekçesini kontrol et.'
      : data.notice === 'content_saved' ? 'Zindan veya boss ayarı kaydedildi ve denetim kaydına eklendi.'
      : data.notice === 'content_disabled' ? 'İçerik pasife alındı; son aktif zindan/boss korundu.'
      : data.notice === 'content_error' ? 'Zindan/boss ayarı kaydedilemedi. Değerleri ve gerekçeyi kontrol et.'
      : '';
    const renderQuestForm = (quest = {}) => '<form method="post" action="/owner/action">'
      + '<input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-daily-quest-save">'
      + '<input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '">'
      + (quest.quest_key ? '<input type="hidden" name="questKey" value="' + escapeHtml(quest.quest_key) + '">' : '<label>Görev kodu (küçük harf, sayı, alt çizgi)</label><input name="questKey" maxlength="40" pattern="[a-z][a-z0-9_]{1,39}" required placeholder="kuzey_gorevi">')
      + '<label>Görev adı</label><input name="title" maxlength="80" value="' + escapeHtml(quest.title || '') + '" required>'
      + '<label>Açıklama</label><textarea name="description" maxlength="240" required>' + escapeHtml(quest.description || '') + '</textarea>'
      + '<label>Hedef türü</label><select name="objectiveType">' + Object.entries(DAILY_QUEST_OBJECTIVES).map(([value, objective]) => '<option value="' + value + '"' + (quest.objective_type === value ? ' selected' : '') + '>' + escapeHtml(objective.label) + '</option>').join('') + '</select>'
      + '<label>Sınıf kısıtlaması</label><select name="className"><option value="">Tüm sınıflar</option>' + DAILY_QUEST_CLASSES.map(name => '<option value="' + escapeHtml(name) + '"' + (quest.class_name === name ? ' selected' : '') + '>' + escapeHtml(name) + '</option>').join('') + '</select>'
      + '<label>Ödül (altın · 0–5000)</label><input type="number" name="rewardCoins" min="0" max="5000" value="' + Number(quest.reward_coins ?? 100) + '" required>'
      + '<label>Durum</label><select name="active"><option value="yes"' + (quest.active === false ? '' : ' selected') + '>Aktif</option><option value="no"' + (quest.active === false ? ' selected' : '') + '>Pasif</option></select>'
      + '<label>İşlem gerekçesi</label><input name="reason" maxlength="200" required placeholder="Değişikliğin nedenini yaz">'
      + '<label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Görev değişikliğini onaylıyorum</label><button class="btn">Görevi kaydet</button></form>';
    const rpgContent = data.rpgContent || [];
    const contentTypeLabels = { dungeon: 'Zindan', solo_boss: 'Tekli boss', raid_boss: 'Ortak boss' };
    const renderContentFields = item => {
      const config = item.config || {};
      const field = (name, label, value, type = 'number', min = null, max = null, step = null) =>
        '<label>' + label + '</label><input type="' + type + '" name="' + name + '" value="' + escapeHtml(value) + '"' +
        (min === null ? '' : ' min="' + min + '"') + (max === null ? '' : ' max="' + max + '"') +
        (step === null ? '' : ' step="' + step + '"') + ' required>';
      if (item.content_type === 'dungeon') return field('name','Zindan adı',config.name,'text')
        + field('hp','Düşman HP',config.hp,'number',80,10000,1)
        + field('damage','Düşman hasarı',config.damage,'number',1,500,1)
        + field('xp','Zafer XP',config.xp,'number',0,10000,1)
        + field('coins','Zafer altını',config.coins,'number',0,10000,1)
        + field('lootChance','Ganimet ihtimali (0–1)',config.lootChance,'number',0,1,0.01)
        + field('loot','Ganimet adı',config.loot,'text');
      if (item.content_type === 'solo_boss') return field('name','Boss adı',config.name,'text')
        + field('region','Bölge',config.region,'text')
        + field('maxHp','Boss HP',config.maxHp,'number',50,20000,1)
        + field('minDamage','Minimum hasar',config.minDamage,'number',1,1000,1)
        + field('maxDamage','Maksimum hasar',config.maxDamage,'number',1,1500,1)
        + field('coinMin','Minimum altın',config.coinMin,'number',0,20000,1)
        + field('coinMax','Maksimum altın',config.coinMax,'number',0,30000,1)
        + field('xpMin','Minimum XP',config.xpMin,'number',0,10000,1)
        + field('xpMax','Maksimum XP',config.xpMax,'number',0,20000,1)
        + field('lootChance','Ganimet ihtimali (0–1)',config.lootChance,'number',0,1,0.01)
        + field('loot','Ganimet listesi (virgülle ayır)',(config.loot || []).join(', '),'text');
      return field('name','Boss adı',config.name,'text')
        + field('hp','Boss HP',config.hp,'number',50,20000,1)
        + field('damage','Boss hasarı',config.damage,'number',1,1500,1)
        + field('xp','Zafer XP',config.xp,'number',0,20000,1)
        + field('coins','Zafer altını',config.coins,'number',0,30000,1)
        + field('loot','Ganimet adı',config.loot,'text')
        + '<label>Zayıflık türü</label><select name="weakness"><option value="spell"' + (config.weakness === 'spell' ? ' selected' : '') + '>Büyü</option><option value="attack"' + (config.weakness === 'attack' ? ' selected' : '') + '>Fiziksel saldırı</option></select>'
        + field('weaknessLabel','Zayıflık açıklaması',config.weaknessLabel,'text');
    };
    const renderContentForm = item => '<form method="post" action="/owner/action">'
      + '<input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-content-save">'
      + '<input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '"><input type="hidden" name="contentType" value="' + escapeHtml(item.content_type) + '"><input type="hidden" name="contentKey" value="' + escapeHtml(item.content_key) + '">'
      + renderContentFields(item)
      + '<label>Durum</label><select name="active"><option value="yes"' + (item.active ? ' selected' : '') + '>Aktif</option><option value="no"' + (!item.active ? ' selected' : '') + '>Pasif</option></select>'
      + '<label>İşlem gerekçesi</label><input name="reason" maxlength="200" required placeholder="Denge değişikliğinin nedeni">'
      + '<label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Değişikliği onaylıyorum</label><button class="btn">Ayarları kaydet</button></form>';
    const rpgContentHtml = '<section class="panel"><h2>Zindan ve boss kataloğu</h2><p class="muted">Zindan ve boss ayarları seçili sunucuya özeldir. Savaş yetenekleri ve özel saldırı türleri sabit tutulur; HP, hasar, ödül, ganimet ve desteklenen zayıflık değerleri güvenli aralıklarla düzenlenebilir. Son aktif içerik kapatılamaz; başlangıç seviyesi zindan ve boss kademeleri korunur.</p>'
      + ['dungeon','solo_boss','raid_boss'].map(type => '<h3>' + contentTypeLabels[type] + 'lar</h3><div class="columns">'
        + rpgContent.filter(item => item.content_type === type).map(item => '<article class="panel"><div class="actions"><span class="tag">' + escapeHtml(item.content_key) + '</span><span class="' + (item.active ? 'good' : 'warn') + '">' + (item.active ? 'Aktif' : 'Pasif') + '</span></div>'
          + '<h3>' + escapeHtml(item.config.name) + '</h3><p class="small">' + (item.config.minLevel ? 'Seviye eşiği: ' + Number(item.config.minLevel) : 'Tüm seviyeler') + (item.config.special ? ' · Özel hamle: ' + escapeHtml(item.config.special) : '') + '</p>'
          + renderContentForm(item)
          + (item.active ? '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-content-disable"><input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '"><input type="hidden" name="contentType" value="' + escapeHtml(item.content_type) + '"><input type="hidden" name="contentKey" value="' + escapeHtml(item.content_key) + '"><label>Pasife alma gerekçesi</label><input name="reason" maxlength="200" required><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> İçeriği pasife almayı onaylıyorum</label><button class="btn danger">Pasife al</button></form>' : '')
          + '</article>').join('') + '</div>').join('') + '</section>';
    const questManagementHtml = '<section class="panel"><h2>Günlük görev kataloğu</h2><p class="muted">Görevler seçili Discord sunucusuna özeldir. Yalnızca desteklenen oyun hedefleri seçilebilir; ödül talebi oyuncu ve gün bazında tekilleştirilir. Silme işlemi geçmiş kayıtları korumak için pasife alma olarak uygulanır.</p>'
      + (dailyQuests.length ? '<div class="columns">' + dailyQuests.map(quest => '<article class="panel"><div class="actions"><span class="tag">' + (quest.is_system ? 'SİSTEM GÖREVİ' : 'ÖZEL GÖREV') + '</span><span class="' + (quest.active ? 'good' : 'warn') + '">' + (quest.active ? 'Aktif' : 'Pasif') + '</span></div><h3>' + escapeHtml(quest.title) + '</h3><p class="small">' + escapeHtml(quest.quest_key) + ' · ' + Number(quest.reward_coins) + ' altın</p>' + renderQuestForm(quest)
        + (quest.active ? '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-daily-quest-disable"><input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '"><input type="hidden" name="questKey" value="' + escapeHtml(quest.quest_key) + '"><label>Pasife alma gerekçesi</label><input name="reason" maxlength="200" required><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Bu görevi pasife almayı onaylıyorum</label><button class="btn danger">Görevi pasife al</button></form>' : '')
        + '</article>').join('') + '</div>' : '<p class="muted">Henüz görev kataloğu yüklenmedi.</p>')
      + '<h3>Yeni görev ekle</h3>' + renderQuestForm() + '</section>';
    return heading('Frieren Poğaça', 'Oyuncu kayıtları, RPG kaynakları ve oyun ekonomisi için denetimli yönetim alanı.')
      + '<div class="grid">'
      + [['Oyuncu', rpg.players], ['Ortalama seviye', rpg.averageLevel], ['Toplam altın', rpg.totalCoins], ['Envanter yığını', rpg.inventoryStacks], ['Eşya adedi', rpg.itemCount], ['Boss zaferi', rpg.bossWins], ['Zindan zaferi', rpg.dungeonWins]]
        .map(([label, value]) => '<div class="stat"><small>' + label + '</small><strong>' + Number(value || 0).toLocaleString('tr-TR') + '</strong></div>').join('')
      + '</div>' + (noticeText ? '<p class="notice">' + noticeText + '</p>' : '') + '<section class="panel"><h2>Oyuncu arama</h2><form method="get" action="/owner/pogaca">'
      + '<label>Discord sunucusu</label><select name="guildId">' + guildOptions.map(guild => '<option value="' + escapeHtml(guild.id) + '"' + (guild.id === selectedGuild ? ' selected' : '') + '>' + escapeHtml(guild.name) + ' · ' + escapeHtml(guild.id) + '</option>').join('') + '</select>'
      + '<label>Oyuncu adı veya Discord ID</label><input name="search" maxlength="80" value="' + escapeHtml(data.search || '') + '" placeholder="Karakter adı veya kullanıcı ID">'
      + '<button class="btn secondary">Oyuncuları bul</button></form>'
      + (players.length ? '<div style="overflow:auto"><table class="data-table"><thead><tr><th>Oyuncu</th><th>Seviye</th><th>Altın</th><th>XP</th><th></th></tr></thead><tbody>' + players.map(player => '<tr><td>' + escapeHtml(player.character_name || player.user_id) + '<div class="small mono">' + escapeHtml(player.user_id) + '</div></td><td>' + Number(player.level || 0) + '</td><td>' + Number(player.coins || 0).toLocaleString('tr-TR') + '</td><td>' + Number(player.xp || 0).toLocaleString('tr-TR') + '</td><td><a href="/owner/pogaca?guildId=' + encodeURIComponent(selectedGuild) + '&userId=' + encodeURIComponent(player.user_id) + '">Detay</a></td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">Oyuncu bulunamadı. Sunucu seçip arama yap.</p>')
      + '</section>'
      + (selectedPlayer ? '<section class="panel"><h2>Oyuncu ayrıntısı</h2><p><strong>' + escapeHtml(selectedPlayer.character_name || 'İsimsiz karakter') + '</strong> · ' + escapeHtml(selectedPlayer.user_id) + '</p>'
        + '<div class="grid"><div class="stat"><small>Sınıf / Seviye</small><strong>' + escapeHtml(selectedPlayer.class_name) + ' / ' + Number(selectedPlayer.level) + '</strong></div><div class="stat"><small>Altın</small><strong>' + Number(selectedPlayer.coins).toLocaleString('tr-TR') + '</strong></div><div class="stat"><small>XP</small><strong>' + Number(selectedPlayer.xp).toLocaleString('tr-TR') + '</strong></div><div class="stat"><small>HP / Mana</small><strong>' + Number(selectedPlayer.hp) + '/' + Number(selectedPlayer.max_hp) + ' · ' + Number(selectedPlayer.mana) + '/' + Number(selectedPlayer.max_mana) + '</strong></div></div>'
        + '<h3>Envanter</h3>' + (selectedPlayer.inventory.length ? selectedPlayer.inventory.map(item => '<div class="rowitem">' + escapeHtml(item.item_key) + '<strong style="float:right">×' + Number(item.quantity) + '</strong></div>').join('') : '<p class="muted">Envanter boş.</p>')
        + '<h3>Kuşanılan ekipman</h3>' + (selectedPlayer.equipment?.length ? selectedPlayer.equipment.map(item => '<div class="rowitem">' + escapeHtml(equipmentSlots.find(slot => slot.id === item.slot)?.label || item.slot) + '<strong style="float:right">' + escapeHtml(item.item_key) + '</strong></div>').join('') : '<p class="muted">Kuşanılmış ekipman yok.</p>')
        + '<h3>Ekipman envanteri düzenle</h3><p class="muted">Yalnızca oyunda tanımlı ekipman kataloğundaki eşyalar eklenebilir. Kuşanılmış son kopya çıkarılamaz. İşlem gerekçesi ve onay zorunludur.</p>'
        + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-inventory-adjust"><input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '"><input type="hidden" name="userId" value="' + escapeHtml(selectedPlayer.user_id) + '">'
        + '<label>Ekipman</label><select name="itemId">' + equipmentItems.map(item => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + ' · ' + escapeHtml(item.rarity) + '</option>').join('') + '</select><label>Adet değişimi (+ ekle / - çıkar)</label><input type="number" name="quantityDelta" min="-1000" max="1000" value="1" required><label>İşlem gerekçesi</label><input name="reason" maxlength="200" required><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Eşya değişikliğini onaylıyorum</label><button class="btn">Envanteri güncelle</button></form>'
        + '<h3>Ekipman kuşan / çıkar</h3><p class="muted">Seviye şartı, sahiplik ve ekipman yuvası doğrulanır. Temel maksimum HP/Mana değiştirilmez; mevcut değerler yeni sınıra göre güvenli biçimde sınırlandırılır.</p>'
        + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-equipment-set"><input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '"><input type="hidden" name="userId" value="' + escapeHtml(selectedPlayer.user_id) + '">'
        + '<label>Yuva</label><select name="slot">' + equipmentSlots.map(slot => '<option value="' + slot.id + '">' + escapeHtml(slot.label) + '</option>').join('') + '</select><label>Ekipman (boş seçilirse yuvayı çıkarır)</label><select name="itemId"><option value="">Yuvayı boşalt</option>' + equipmentItems.map(item => '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + ' · Seviye ' + item.levelReq + '+</option>').join('') + '</select><label>İşlem gerekçesi</label><input name="reason" maxlength="200" required><label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Ekipman değişikliğini onaylıyorum</label><button class="btn">Ekipmanı uygula</button></form>'
        + '<h3>Kaynak düzeltmesi</h3><p class="muted">Yalnızca altın ve XP değiştirilebilir. Negatif altın azaltır; XP yalnızca artırılabilir, böylece kazanılmış stat puanları korunur. Her işlem veritabanı transaction ve owner denetim kaydıyla kaydedilir. Değerler sıfırın altına inmez; tek işlem üst sınırı ±1.000.000.</p>'
        + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-resource-adjust"><input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '"><input type="hidden" name="userId" value="' + escapeHtml(selectedPlayer.user_id) + '">'
        + '<label>Altın değişimi (+/-)</label><input type="number" name="coinsDelta" min="-1000000" max="1000000" value="0">'
        + '<label>XP değişimi (+/-)</label><input type="number" name="xpDelta" min="0" max="1000000" value="0">'
        + '<label>İşlem gerekçesi (zorunlu)</label><input name="reason" maxlength="200" required placeholder="Örn. hatalı ödül düzeltmesi">'
        + '<label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Bu kaynak değişikliğini onaylıyorum</label><button class="btn">Kaynakları güncelle</button></form></section>' : '')
      + questManagementHtml
      + rpgContentHtml
      + '<p class="notice warn">Oyuncu silme, HP/Mana değerlerini doğrudan değiştirme ve oyuncuların görev/boss ilerlemesini elle değiştirme kapalıdır. Görev tanımları ise sunucu bazında, denetim kaydıyla yönetilir.</p>'
      + '<div class="columns">' + card('Komut ve davranışlar', 'Komutları sunucu bazında yönet.', '/owner#behavior') + card('Sunucu ayarları', 'Karşılama ve özellik tercihleri.', '/owner#servers') + '</div>';
  }
  if (kind === 'database') {
    const db = data.database;
    if (!db?.connected) return heading('Veritabanı', 'PostgreSQL bağlantı ve tablo sağlığı.').replace('</section>', '</section>')
      + '<div class="notice bad">Veritabanı tanılaması alınamadı.</div>';
    return heading('PostgreSQL', 'Üretim verilerine zarar vermeden salt okunur veritabanı görünümü.')
      + '<div class="grid"><div class="stat"><small>Bağlantı</small><strong class="good">Bağlı</strong></div>'
      + '<div class="stat"><small>Veritabanı</small><strong>' + escapeHtml(db.databaseName) + '</strong></div>'
      + '<div class="stat"><small>Tablo sayısı</small><strong>' + db.tables.length + '</strong></div>'
      + '<div class="stat"><small>Veritabanı boyutu</small><strong>' + (Number(db.databaseSizeBytes || 0) / 1024 / 1024).toFixed(1) + ' MB</strong></div>'
      + '<div class="stat"><small>PostgreSQL</small><strong>' + escapeHtml(db.serverVersion || '—') + '</strong></div>'
      + '<div class="stat"><small>Aktif / boş bağlantı</small><strong>' + Number(db.activeConnections || 0) + ' / ' + Number(db.idleConnections || 0) + '</strong></div></div>'
      + '<section class="panel"><h2>Tablolar</h2><p class="muted">Kayıtlar salt okunur görüntülenir. Parola, token, anahtar, e-posta, mesaj ve hafıza içeriği gibi hassas alanlar listelenmez.</p>'
      + (db.tables.length ? '<div class="rowitem"><strong>Tablo</strong><strong style="float:right">Tahmini kayıt</strong></div>' + db.tables.map(row => '<div class="rowitem"><a href="/owner/database?table=' + encodeURIComponent(row.name) + '">' + escapeHtml(row.name) + '</a><strong style="float:right">' + Number(row.rows).toLocaleString('tr-TR') + '</strong></div>').join('') : '<p class="muted">Tablo bulunamadı.</p>')
      + '</section>'
      + (data.preview ? '<section class="panel"><h2>' + escapeHtml(data.preview.table) + ' · kayıt önizleme</h2><form method="get" action="/owner/database"><input type="hidden" name="table" value="' + escapeHtml(data.preview.table) + '"><label>Güvenli alanlarda ara</label><input name="search" maxlength="80" value="' + escapeHtml(data.preview.search) + '" placeholder="Arama terimi"><button class="btn secondary">Ara</button></form>'
        + (data.preview.rows.length && data.preview.columns.length ? '<div style="overflow:auto"><table class="data-table"><thead><tr>' + data.preview.columns.map(name => '<th>' + escapeHtml(name) + '</th>').join('') + '</tr></thead><tbody>' + data.preview.rows.map(row => '<tr>' + data.preview.columns.map(name => '<td>' + escapeHtml(row[name]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '<p class="muted">Gösterilecek kayıt bulunamadı veya bu tabloda güvenli alan yok.</p>') + '</section>' : '')
      + '<section class="panel"><h2>Yedekleme ve geri yükleme</h2>'
      + '<div class="notice warn">Neon Free planında otomatik snapshot zamanlaması kullanılamaz. Son doğrulanan üretim yapılandırmasında 6 saatlik Point-in-Time Restore (PITR) geçmişi bulunuyor. Manuel snapshot ücretsiz değildir: depolama yaklaşık 0,09 USD/GB-ay ve Free planında 1 manuel snapshot sınırı vardır. Bu panel ücretli snapshot veya üretim geri yüklemesi başlatmaz.</div>'
      + '<p class="muted">Geri yükleme gerekirse Neon Console üzerinden önce ayrı bir kurtarma dalına (branch) geri yükle, verileri doğrula ve ancak bundan sonra üretim dalını değiştir. Doğrudan üretim dalının üzerine geri yükleme bu panelde özellikle kapalı tutulur.</p>'
      + (data.backup?.consoleUrl ? '<a class="btn secondary" href="' + escapeHtml(data.backup.consoleUrl) + '" target="_blank" rel="noopener">Neon yedekleme ve dalları aç</a>' : '<p class="small">Neon proje bağlantısı için Render ortamında NEON_PROJECT_ID yapılandırılmamış.</p>')
      + '</section>'
      + '<p class="small">Son kontrol: ' + escapeHtml(db.checkedAt ? new Date(db.checkedAt).toLocaleString('tr-TR') : 'bilinmiyor') + '</p>';
  }
  if (kind === 'settings') {
    const checks = data.settings || [];
    return heading('Owner ayarları', 'Panel güvenliği ve bağlantı yapılandırmasının varlık kontrolü. Gizli değerler gösterilmez.')
      + '<section class="panel"><h2>Yapılandırma durumu</h2>' + checks.map(item =>
        '<div class="rowitem"><strong>' + escapeHtml(item.label) + '</strong><span class="' + (item.configured ? 'good' : 'warn') + '" style="float:right">' + (item.configured ? 'Yapılandırıldı' : 'Eksik') + '</span></div>'
      ).join('') + '</section><p class="notice">Güvenlik gereği token, API anahtarı, parola veya bağlantı dizesi bu ekranda görüntülenmez.</p>';
  }
  return '<section class="hero"><h1>Owner çalışma alanı</h1></section>';
}


const PRIVATE_COLUMN = /(password|secret|token|credential|api.?key|access.?key|refresh|email|phone|address|ip.?address|memory.?value|message.?content|content|setting.?value|details)/i;
const quoteIdentifier = value => '"' + String(value).replace(/"/g, '""') + '"';

export async function getOwnerDatabaseTablePreview(db, { table, search = '' } = {}) {
  const tableName = String(table || '').trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) throw new Error('INVALID_DATABASE_TABLE');
  const allowed = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name=$1 LIMIT 1",
    [tableName]
  );
  if (!allowed.rows?.length) throw new Error('DATABASE_TABLE_NOT_FOUND');
  const metadata = await db.query(
    "SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [tableName]
  );
  const columns = (metadata.rows || []).filter(row =>
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(row.column_name || '')) && !PRIVATE_COLUMN.test(row.column_name)
  ).slice(0, 10);
  if (!columns.length) return { table: tableName, columns: [], rows: [], search: '' };
  const term = String(search || '').trim().slice(0, 80);
  const searchable = columns.filter(row => /text|character|uuid|integer|bigint|numeric|boolean|date|timestamp/i.test(row.data_type));
  const where = term && searchable.length
    ? ' WHERE ' + searchable.map(row => quoteIdentifier(row.column_name) + "::text ILIKE $1").join(' OR ')
    : '';
  const params = term && searchable.length ? ['%' + term.replace(/[\\%_]/g, '\\$&') + '%', 25] : [25];
  const result = await db.query(
    'SELECT ' + columns.map(row => quoteIdentifier(row.column_name)).join(',') +
    ' FROM public.' + quoteIdentifier(tableName) + where + ' LIMIT $' + params.length,
    params
  );
  return {
    table: tableName,
    columns: columns.map(row => row.column_name),
    rows: (result.rows || []).map(row => Object.fromEntries(columns.map(column => [
      column.column_name,
      row[column.column_name] == null ? '' : String(row[column.column_name]).slice(0, 240)
    ]))),
    search: term
  };
}
