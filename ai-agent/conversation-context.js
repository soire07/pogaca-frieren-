const ROLE_LABELS = {
  user: 'KULLANICI',
};

const CANONICAL_CHARACTER_PROFILES = [
  'KESİN KARAKTER KAYITLARI (yetkili ve doğrulanmış kaynak; bu kayıtlar ve KULLANICI mesajları olgusal kaynak kabul edilir):',
  '- Arven: 19 yaşında; kayıp kardeşini arıyor; en sevdiği hayvan kediler. Yaşadığı yer belirtilmedi.',
  '- Eldrin: 24 yaşında; sahil kasabasında yaşıyor; kayıp bir haritayı bulmaya çalışıyor; en sevdiği hayvan baykuş.',
  'Bu kayıtlar karakter profillerinin doğru ve güncel kaynağıdır. Eski konuşma geçmişinde veya FRIEREN AI cevaplarında bunlarla çelişen bilgi varsa bu kesin kayıtları esas al. Arven ile Eldrin’in amaçlarını, yaşlarını, yerlerini veya hayvan tercihlerini asla birbirine aktarma. Arven’in yaşadığı yeri bilinmiyor kabul et. Kullanıcı yeni ve açık bir düzeltme verirse en son düzeltme bu kayıtların da üstündedir.',
].join('\n');

export function formatConversationContext(history) {
  const validTurns = Array.isArray(history)
    ? history.filter(turn => turn && turn.role === 'user' && typeof turn.content === 'string' && turn.content.trim())
    : [];

  // Only user-authored turns may establish facts. Assistant answers can contain
  // guesses or hallucinations and must never be recycled as evidence.
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
    CANONICAL_CHARACTER_PROFILES,
    ...(turns.length ? [
      '',
      'ÖNCEKİ AYNI DISCORD KANALI / KONUŞMA (yalnızca kullanıcının yazdığı mesajlar):',
      ...turns,
    ] : []),
    '',
    `BAĞLAM KURALI: KESİN KARAKTER KAYITLARI karakterlere ait doğrulanmış bilgilerin yetkili kaynağıdır; ayrıca yalnızca KULLANICI mesajları konuşma geçmişinden yeni olgular sağlayabilir. FRIEREN AI tarafından daha önce üretilmiş cevaplar, özetler, çıkarımlar veya tahminler karakter bilgisi için kanıt değildir; bunları gerçekmiş gibi tekrarlama. Kullanıcı bir bilgiyi açıkça doğrulamadıkça asistanın önceki iddialarını yok say. Kullanıcının en son açık düzeltmesi önceki kullanıcı beyanlarıyla çelişirse en son düzeltmeyi esas al. Açılış mesajlarında veya son mesajlarda açıkça verilen karakter, hikâye ve olay bilgileri mevcut sorunun bağlamıdır. KESİN KARAKTER KAYITLARINI ve kullanıcı mesajlarındaki bilgileri birlikte kullan; yeniden verilmesini isteme. Yalnızca erişilebilir kullanıcı kayıtlarında bulunmayan ayrıntıları bilinmiyor olarak belirt. Kişisel kalıcı bellek kayıtlarını kurguya taşıma. Tanıtılan karakter kullanıcı değildir; kullanıcı açıkça rol yaptığını söylemedikçe karakterden üçüncü şahısla söz et ve karakter özelliklerini kullanıcıya atfetme. Her karakter için ayrı bir profil tut. Yaş, yaşadığı yer, hayvan tercihi ve amaç gibi her alanı yalnızca aynı cümlede veya açık bir gönderimde adı belirtilen karaktere bağla; yalnızca yakınında geçmesi, aynı mesajda bulunması veya başka karaktere ait olması bilgi aktarımı için yeterli değildir. Arven'in kayıp kardeşini arama amacı yalnızca Arven'e; Eldrin'in kayıp haritayı arama amacı yalnızca Eldrin'e aittir. Bu amaçları asla birbirine aktarma. Bir alan ilgili karaktere açıkça bağlanmamışsa o alanı bilinmiyor kabul et; yaş, yer veya hayvan tercihi tahmin etme. Bir karakter sorulduğunda yalnızca o karaktere açıkça bağlanmış bilgileri kullan. Bu bağlam başka Discord kanallarını veya başka kullanıcıları kapsamaz`,
  ].join('\n');
}


export function buildConversationContextMessage(history) {
  return {
    role: 'system',
    content: formatConversationContext(history),
  };
}
