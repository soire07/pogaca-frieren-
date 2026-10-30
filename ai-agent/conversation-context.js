const ROLE_LABELS = {
  user: 'KULLANICI',
  assistant: 'FRIEREN AI',
};

export function formatConversationContext(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const validTurns = history
    .filter(turn => turn && ROLE_LABELS[turn.role] && typeof turn.content === 'string' && turn.content.trim());
  if (!validTurns.length) return '';

  // Keep the opening turns (where story/character profiles are commonly introduced)
  // and the newest turns, without sending the entire database history to the free model.
  const openingCount = Math.min(4, validTurns.length);
  const recentStart = Math.max(openingCount, validTurns.length - 8);
  const selected = [
    ...validTurns.slice(0, openingCount),
    ...validTurns.slice(recentStart),
  ];
  const turns = selected.map(turn =>
    ROLE_LABELS[turn.role] + ': ' + turn.content.trim().slice(0, 1200)
  );
  return [
    'ÖNCEKİ AYNI DISCORD KANALI / KONUŞMA (kronolojik kayıt):',
    ...turns,
    '',
    'BAĞLAM KURALI: Açılış mesajlarında veya son mesajlarda açıkça verilen karakter, hikâye ve olay bilgileri mevcut sorunun bağlamıdır. Bu iki bölümdeki bilgileri birlikte kullan; yeniden verilmesini isteme. Yalnızca erişilebilir kayıtlarda bulunmayan ayrıntıları bilinmiyor olarak belirt. Kişisel kalıcı bellek kayıtlarını kurguya taşıma. Tanıtılan karakter kullanıcı değildir; kullanıcı açıkça rol yaptığını söylemedikçe karakterden üçüncü şahısla söz et ve karakter özelliklerini kullanıcıya atfetme. Her karakter için ayrı bir profil tut. Yaş, yaşadığı yer, hayvan tercihi ve amaç gibi her alanı yalnızca aynı cümlede veya açık bir gönderimde adı belirtilen karaktere bağla; yalnızca yakınında geçmesi, aynı mesajda bulunması veya başka karaktere ait olması bilgi aktarımı için yeterli değildir. Arven\'in kayıp kardeşini arama amacı yalnızca Arven'e; Eldrin\'in kayıp haritayı arama amacı yalnızca Eldrin'e aittir. Bu amaçları asla birbirine aktarma. Bir alan ilgili karaktere açıkça bağlanmamışsa o alanı bilinmiyor kabul et; yaş, yer veya hayvan tercihi tahmin etme. Bir karakter sorulduğunda yalnızca o karaktere açıkça bağlanmış bilgileri kullan. Bu bağlam başka Discord kanallarını veya başka kullanıcıları kapsamaz.',
  ].join('\n');
}
