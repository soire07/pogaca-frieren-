const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

export async function getOwnerDatabaseDiagnostics(db) {
  const health = await db.query('SELECT current_database() AS database_name, current_user AS database_user, NOW() AS checked_at');
  const tables = await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'
     ORDER BY table_name LIMIT 40`
  );
  const counts = [];
  for (const row of tables.rows || []) {
    const name = String(row.table_name || '');
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) continue;
    const result = await db.query('SELECT COUNT(*)::bigint AS row_count FROM public."' + name + '"');
    counts.push({ name, rows: Number(result.rows?.[0]?.row_count || 0) });
  }
  return {
    connected: true,
    databaseName: String(health.rows?.[0]?.database_name || ''),
    checkedAt: health.rows?.[0]?.checked_at || null,
    tables: counts
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
      + '<section class="panel"><h2>Komut test çalıştırıcısı</h2><p class="muted">Boş bırakılırsa tüm komutlar denetlenir. Belirli komutları virgül veya satırla ayırarak girebilirsin. Testler sentetik etkileşim kullanır; gerçek Discord kullanıcısı adına işlem yapmaz.</p>'
      + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="ai-test-run">'
      + '<label>Komut adları (isteğe bağlı)</label><textarea name="commands" maxlength="2000" placeholder="karakter, bakiye, zindan"></textarea>'
      + '<label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Testleri şimdi çalıştırmayı onaylıyorum</label><button class="btn">Testleri çalıştır</button></form>'
      + (data.testReport ? '<h3>Son çalıştırma sonucu</h3><div class="grid"><div class="stat"><small>Toplam</small><strong>' + Number(data.testReport.summary?.total ?? data.testReport.total ?? 0) + '</strong></div><div class="stat"><small>Başarılı</small><strong class="good">' + Number(data.testReport.summary?.pass ?? data.testReport.passed ?? 0) + '</strong></div><div class="stat"><small>Başarısız</small><strong class="bad">' + Number(data.testReport.summary?.fail ?? data.testReport.failed ?? 0) + '</strong></div></div><pre class="report">' + escapeHtml(JSON.stringify(data.testReport, null, 2).slice(0, 14000)) + '</pre>' : '') + '</section>'
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
    const noticeText = data.notice === 'rpg_saved' ? 'Oyuncu kaynakları güncellendi ve işlem denetim kaydına yazıldı.' : data.notice === 'rpg_error' ? 'Kaynak güncellemesi yapılamadı. Oyuncuyu, gerekçeyi ve değerleri kontrol et.' : '';
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
        + '<h3>Envanter (salt okunur)</h3>' + (selectedPlayer.inventory.length ? selectedPlayer.inventory.map(item => '<div class="rowitem">' + escapeHtml(item.item_key) + '<strong style="float:right">×' + Number(item.quantity) + '</strong></div>').join('') : '<p class="muted">Envanter boş.</p>')
        + '<h3>Kaynak düzeltmesi</h3><p class="muted">Yalnızca altın ve XP değiştirilebilir. Negatif altın azaltır; XP yalnızca artırılabilir, böylece kazanılmış stat puanları korunur. Her işlem veritabanı transaction ve owner denetim kaydıyla kaydedilir. Değerler sıfırın altına inmez; tek işlem üst sınırı ±1.000.000.</p>'
        + '<form method="post" action="/owner/action"><input type="hidden" name="csrf" value="' + escapeHtml(data.csrf || '') + '"><input type="hidden" name="action" value="rpg-resource-adjust"><input type="hidden" name="guildId" value="' + escapeHtml(selectedGuild) + '"><input type="hidden" name="userId" value="' + escapeHtml(selectedPlayer.user_id) + '">'
        + '<label>Altın değişimi (+/-)</label><input type="number" name="coinsDelta" min="-1000000" max="1000000" value="0">'
        + '<label>XP değişimi (+/-)</label><input type="number" name="xpDelta" min="0" max="1000000" value="0">'
        + '<label>İşlem gerekçesi (zorunlu)</label><input name="reason" maxlength="200" required placeholder="Örn. hatalı ödül düzeltmesi">'
        + '<label><input type="checkbox" name="confirm" value="yes" required style="display:inline;width:auto"> Bu kaynak değişikliğini onaylıyorum</label><button class="btn">Kaynakları güncelle</button></form></section>' : '')
      + '<p class="notice warn">Oyuncu silme, eşya ekleme/silme, HP, ekipman, görev ve boss ilerlemesi değiştirme kapalıdır. Bu işlemler için ayrı doğrulama ve geri alma mekanizması olmadan üretim verisine dokunulmaz.</p>'
      + '<div class="columns">' + card('Komut ve davranışlar', 'Komutları sunucu bazında yönet.', '/owner#behavior') + card('Sunucu ayarları', 'Karşılama ve özellik tercihleri.', '/owner#servers') + '</div>';
  }
  if (kind === 'database') {
    const db = data.database;
    if (!db?.connected) return heading('Veritabanı', 'PostgreSQL bağlantı ve tablo sağlığı.').replace('</section>', '</section>')
      + '<div class="notice bad">Veritabanı tanılaması alınamadı.</div>';
    return heading('PostgreSQL', 'Üretim verilerine zarar vermeden salt okunur veritabanı görünümü.')
      + '<div class="grid"><div class="stat"><small>Bağlantı</small><strong class="good">Bağlı</strong></div>'
      + '<div class="stat"><small>Veritabanı</small><strong>' + escapeHtml(db.databaseName) + '</strong></div>'
      + '<div class="stat"><small>Tablo sayısı</small><strong>' + db.tables.length + '</strong></div></div>'
      + '<section class="panel"><h2>Tablolar</h2><p class="muted">Kayıtlar salt okunur görüntülenir. Parola, token, anahtar, e-posta, mesaj ve hafıza içeriği gibi hassas alanlar listelenmez.</p>'
      + (db.tables.length ? '<div class="rowitem"><strong>Tablo</strong><strong style="float:right">Kayıt</strong></div>' + db.tables.map(row => '<div class="rowitem"><a href="/owner/database?table=' + encodeURIComponent(row.name) + '">' + escapeHtml(row.name) + '</a><strong style="float:right">' + Number(row.rows).toLocaleString('tr-TR') + '</strong></div>').join('') : '<p class="muted">Tablo bulunamadı.</p>')
      + '</section>'
      + (data.preview ? '<section class="panel"><h2>' + escapeHtml(data.preview.table) + ' · kayıt önizleme</h2><form method="get" action="/owner/database"><input type="hidden" name="table" value="' + escapeHtml(data.preview.table) + '"><label>Güvenli alanlarda ara</label><input name="search" maxlength="80" value="' + escapeHtml(data.preview.search) + '" placeholder="Arama terimi"><button class="btn secondary">Ara</button></form>'
        + (data.preview.rows.length && data.preview.columns.length ? '<div style="overflow:auto"><table class="data-table"><thead><tr>' + data.preview.columns.map(name => '<th>' + escapeHtml(name) + '</th>').join('') + '</tr></thead><tbody>' + data.preview.rows.map(row => '<tr>' + data.preview.columns.map(name => '<td>' + escapeHtml(row[name]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '<p class="muted">Gösterilecek kayıt bulunamadı veya bu tabloda güvenli alan yok.</p>') + '</section>' : '')
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


const PRIVATE_COLUMN = /(password|secret|token|credential|api.?key|access.?key|refresh|email|phone|address|ip.?address|memory.?value|message.?content|content)/i;
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
