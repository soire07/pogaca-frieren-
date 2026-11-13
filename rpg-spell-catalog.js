/**
 * Shared display metadata for learned RPG spells.
 * The Discord /buyular command and the web spellbook use the same definitions.
 */
export const spellDetails = Object.freeze({
  zoltraak: Object.freeze({ name: '⚡ Zoltraak', cost: 'Başlangıç büyüsü', effect: '8 Mana · Dengeli saldırı' }),
  alev_kuresi: Object.freeze({ name: '🔥 Alev Küresi', cost: '180 altın', effect: '14 Mana · Yüksek hasar' }),
  buz_mizragi: Object.freeze({ name: '🧊 Buz Mızrağı', cost: '160 altın', effect: '12 Mana · %35 dondurma ihtimali' }),
  koruyucu_bariyer: Object.freeze({ name: '🛡️ Koruyucu Bariyer', cost: '120 altın', effect: '6 Mana · Karşı saldırıyı azaltır' }),
  sifa_isigi: Object.freeze({ name: '💚 Şifa Işığı', cost: '200 altın', effect: '20 Mana · Savaşta bir kez iyileştirir' }),
  yildirim_zinciri: Object.freeze({ name: '⚡ Yıldırım Zinciri', cost: '420 altın · Sv.10 + 3 boss', effect: '22 Mana · Yüksek zincir hasarı' }),
  tas_duvar: Object.freeze({ name: '🪨 Taş Duvar', cost: '360 altın · Sv.15 + 5 boss', effect: '12 Mana · Bir sonraki saldırının %75’ini engeller' }),
  mana_patlamasi: Object.freeze({ name: '🌌 Mana Patlaması', cost: '650 altın · Sv.25 + 10 boss', effect: '30 Mana · Çok yüksek hasar' })
});
