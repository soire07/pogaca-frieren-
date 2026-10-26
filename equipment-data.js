export const equipmentItems = [
  { id: 'iron_sword', name: '⚔️ Gezginin Demir Kılıcı', slot: 'weapon', slotLabel: 'Silah', rarity: 'Yaygın', price: 250, levelReq: 1, attack: 3, defense: 0, hp: 0, mana: 0, description: 'Başlangıç maceracıları için güvenilir bir kılıç.' },
  { id: 'mage_staff', name: '🪄 Büyücü Asası', slot: 'weapon', slotLabel: 'Silah', rarity: 'Nadir', price: 700, levelReq: 5, attack: 2, defense: 0, hp: 0, mana: 20, description: 'Mana akışını düzenleyen hafif bir asa.' },
  { id: 'himmel_sword', name: '🌟 Himmel’in Kahraman Kılıcı', slot: 'weapon', slotLabel: 'Silah', rarity: 'Destansı', price: 1800, levelReq: 15, attack: 8, defense: 0, hp: 0, mana: 0, description: 'Cesaret ve kahramanlık hikâyelerinden ilham alan güçlü kılıç.' },
  { id: 'demon_blade', name: '🩸 Kuzey İblisi Keseni', slot: 'weapon', slotLabel: 'Silah', rarity: 'Efsanevi', price: 4200, levelReq: 35, attack: 16, defense: 0, hp: 0, mana: 0, description: 'İblis zırhlarını parçalamak için dövülmüş efsanevi kılıç.' },
  { id: 'traveler_cloak', name: '🧥 Gezgin Pelerini', slot: 'armor', slotLabel: 'Zırh', rarity: 'Yaygın', price: 300, levelReq: 1, attack: 0, defense: 2, hp: 10, mana: 0, description: 'Soğuk kuzey yollarında hafif koruma sağlar.' },
  { id: 'fern_robe', name: '🟣 Fern’in Büyücü Cübbesi', slot: 'armor', slotLabel: 'Zırh', rarity: 'Nadir', price: 850, levelReq: 8, attack: 0, defense: 4, hp: 0, mana: 20, description: 'Büyü odaklanmasını ve savunmayı destekleyen cübbe.' },
  { id: 'frieren_robe', name: '✨ Frieren’in Kadim Cübbesi', slot: 'armor', slotLabel: 'Zırh', rarity: 'Destansı', price: 2100, levelReq: 20, attack: 0, defense: 7, hp: 20, mana: 30, description: 'Kadim büyü korumalarıyla güçlendirilmiş cübbe.' },
  { id: 'demon_armor', name: '👑 Kuzey İblisi Zırhı', slot: 'armor', slotLabel: 'Zırh', rarity: 'Efsanevi', price: 4600, levelReq: 40, attack: 0, defense: 13, hp: 60, mana: 0, description: 'Kuzey iblislerinin saldırılarına karşı tasarlanmış ağır zırh.' },
  { id: 'copper_ring', name: '💍 Bakır Gezgin Yüzüğü', slot: 'ring', slotLabel: 'Yüzük', rarity: 'Yaygın', price: 180, levelReq: 1, attack: 1, defense: 0, hp: 0, mana: 0, description: 'Küçük ama güvenilir bir saldırı tılsımı.' },
  { id: 'mana_ring', name: '🔮 Mana Dairesi Yüzüğü', slot: 'ring', slotLabel: 'Yüzük', rarity: 'Nadir', price: 650, levelReq: 10, attack: 0, defense: 0, hp: 0, mana: 25, description: 'Büyücünün mana rezervini genişleten yüzük.' },
  { id: 'rune_ring', name: '🗿 Kadim Rün Yüzüğü', slot: 'ring', slotLabel: 'Yüzük', rarity: 'Destansı', price: 1600, levelReq: 25, attack: 0, defense: 3, hp: 20, mana: 20, description: 'Harabe rünleriyle örülmüş dengeli bir koruma yüzüğü.' },
  { id: 'hero_ring', name: '🌠 Kahramanların Efsanevi Yüzüğü', slot: 'ring', slotLabel: 'Yüzük', rarity: 'Efsanevi', price: 3500, levelReq: 45, attack: 5, defense: 5, hp: 30, mana: 0, description: 'Uzun yolculukların ve büyük zaferlerin efsanevi yadigârı.' }
];

export const equipmentSlots = [
  { id: 'weapon', label: '⚔️ Silah' },
  { id: 'armor', label: '🛡️ Zırh' },
  { id: 'ring1', label: '💍 Yüzük I' },
  { id: 'ring2', label: '💍 Yüzük II' }
];

export function equipmentBonus(items) {
  return items.reduce((total, item) => ({
    attack: total.attack + Number(item.attack || 0),
    defense: total.defense + Number(item.defense || 0),
    hp: total.hp + Number(item.hp || 0),
    mana: total.mana + Number(item.mana || 0)
  }), { attack: 0, defense: 0, hp: 0, mana: 0 });
}

export function formatEquipmentBonus(item) {
  const parts = [];
  if (item.attack) parts.push('⚔️ +' + item.attack + ' saldırı');
  if (item.defense) parts.push('🛡️ +' + item.defense + ' savunma');
  if (item.hp) parts.push('❤️ +' + item.hp + ' maksimum HP');
  if (item.mana) parts.push('🔮 +' + item.mana + ' maksimum Mana');
  return parts.join(' · ') || 'Ek stat bonusu yok';
}
