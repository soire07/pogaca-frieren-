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
      + (data.testReport ? '<h3>Son çalıştırma sonucu</h3><div class="grid"><div class="stat"><small>Toplam</small><strong>' + Number(data.testReport.total || 0) + '</strong></div><div class="stat"><small>Başarılı</small><strong class="good">' + Number(data.testReport.passed || 0) + '</strong></div><div class="stat"><small>Başarısız</small><strong class="bad">' + Number(data.testReport.failed || 0) + '</strong></div></div><pre class="report">' + escapeHtml(JSON.stringify(data.testReport, null, 2).slice(0, 14000)) + '</pre>' : '') + '</section>'
      + '<div class="columns">' + card('AI hafızası', 'Kayıtlı hafızaları görüntüle ve gerektiğinde sil.', '/owner#memories')
      + card('Teknik talepler', 'Kod değişikliği taleplerini onayla veya reddet.', '/owner#approvals')
      + card('Genel durum', 'Ana kontrol merkezine dön.', '/owner') + '</div>';
  }
  if (kind === 'pogaca') {
    const rpg = data.rpgMetrics || {};
    return heading('Frieren Poğaça', 'Anime, karakterler, büyüler ve RPG ekonomisi için bot yönetim alanı.')
      + '<div class="grid">'
      + [['Oyuncu', rpg.players], ['Ortalama seviye', rpg.averageLevel], ['Toplam altın', rpg.totalCoins], ['Envanter yığını', rpg.inventoryStacks], ['Eşya adedi', rpg.itemCount], ['Boss zaferi', rpg.bossWins], ['Zindan zaferi', rpg.dungeonWins]]
        .map(([label, value]) => '<div class="stat"><small>' + label + '</small><strong>' + Number(value || 0).toLocaleString('tr-TR') + '</strong></div>').join('')
      + '</div><div class="columns">'
      + card('Sunucu ve karşılama', 'Sunucuya özel karşılama mesajlarını yönet.', '/owner#servers')
      + card('Komut ve davranışlar', 'Komutları ve oyun özelliklerini sunucu bazında açıp kapat.', '/owner#behavior')
      + card('RPG merkezi', 'Mevcut RPG istatistikleri ve oyun alanı.', '/owner#rpg')
      + card('Partnerlik', 'Partner sunucularını ve davetlerini yönet.', '/owner#partners')
      + '</div><p class="notice warn">Oyuncu, eşya, ekonomi, görev ve boss verilerinde doğrudan düzenleme kontrolleri henüz etkin değil. Bu sayfa şu an güvenli, salt okunur özet sunar.</p>';
  }
  if (kind === 'database') {
    const db = data.database;
    if (!db?.connected) return heading('Veritabanı', 'PostgreSQL bağlantı ve tablo sağlığı.').replace('</section>', '</section>')
      + '<div class="notice bad">Veritabanı tanılaması alınamadı.</div>';
    return heading('PostgreSQL', 'Üretim verilerine zarar vermeden salt okunur veritabanı görünümü.')
      + '<div class="grid"><div class="stat"><small>Bağlantı</small><strong class="good">Bağlı</strong></div>'
      + '<div class="stat"><small>Veritabanı</small><strong>' + escapeHtml(db.databaseName) + '</strong></div>'
      + '<div class="stat"><small>Tablo sayısı</small><strong>' + db.tables.length + '</strong></div></div>'
      + '<section class="panel"><h2>Tablo kayıt sayıları</h2><p class="muted">Yalnızca public şemasındaki tablo adları ve kayıt sayıları okunur. Veri içeriği değiştirilmez.</p>'
      + (db.tables.length ? '<div class="rowitem"><strong>Tablo</strong><strong style="float:right">Kayıt</strong></div>' + db.tables.map(row => '<div class="rowitem"><span>' + escapeHtml(row.name) + '</span><strong style="float:right">' + Number(row.rows).toLocaleString('tr-TR') + '</strong></div>').join('') : '<p class="muted">Tablo bulunamadı.</p>')
      + '</section><p class="small">Son kontrol: ' + escapeHtml(db.checkedAt ? new Date(db.checkedAt).toLocaleString('tr-TR') : 'bilinmiyor') + '</p>';
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
