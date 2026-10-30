const ROLE_LABELS = {
  user: 'KULLANICI',
  assistant: 'FRIEREN AI',
};

export function formatConversationContext(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const turns = history
    .filter(turn => turn && ROLE_LABELS[turn.role] && typeof turn.content === 'string' && turn.content.trim())
    .slice(-8)
    .map(turn => ROLE_LABELS[turn.role] + ': ' + turn.content.trim().slice(0, 1500));
  if (!turns.length) return '';
  return [
    'ÖNCEKİ AYNI KULLANICI KONUŞMASI (kronolojik kayıt):',
    ...turns,
    '',
    'BAĞLAM KURALI: Yukarıdaki kullanıcı mesajlarında açıkça verilen karakter, hikâye ve olay bilgileri mevcut sorunun bağlamıdır. Sorulan bilgi bu kayıtlarda varsa doğrudan kullan; yeniden verilmesini isteme. Yalnızca kayıtlarda bulunmayan ayrıntıları bilinmiyor olarak belirt. Kişisel kalıcı bellek kayıtlarını kurguya taşıma.',
  ].join('\n');
}
