const CORRECTION = /\b(?:yanlış|yanlis|hatalı|hatali|hayır|hayir|aslında|aslinda|düzeltme|duzeltme|öyle değil|oyle degil|doğrusu|dogrusu)\b/iu;
const UNCERTAINTY = /\b(?:emin değilim|emin degilim|bilmiyorum|doğrulayamıyorum|dogrulayamiyorum|kesin değil|kesin degil|kaynak bulamadım|kaynak bulamadim)\b/iu;
function normalizeQuestion(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('tr-TR')
    .replace(/[\p{P}\p{S}\s]+/gu, ' ').trim().slice(0, 500);
}
/** Detect learning opportunities locally. Raw conversation text is never sent to Neural or persisted by this module. */
export function detectNeuralLearningSignals({ history = [], userMessage = '', assistantReply = '' } = {}) {
  const signals = [];
  if (CORRECTION.test(String(userMessage || ''))) signals.push({ signal_type: 'correction', dimension: 'correctness' });
  if (UNCERTAINTY.test(String(assistantReply || ''))) signals.push({ signal_type: 'uncertainty', dimension: 'grounding' });
  const normalized = normalizeQuestion(userMessage);
  if (normalized.length >= 12 && Array.isArray(history) &&
      history.some(turn => turn?.role === 'user' && normalizeQuestion(turn.content) === normalized)) {
    signals.push({ signal_type: 'repeated_question', dimension: 'conversation_consistency' });
  }
  return signals;
}
