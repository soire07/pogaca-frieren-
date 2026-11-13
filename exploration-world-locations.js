/**
 * Fan-made cartographic placements for canon Frieren locations and the bot's RPG encounters.
 * Coordinates are percentages on the 3:2 atlas artwork, not claims of official map coordinates.
 */
export const FRIEREN_WORLD_SETTLEMENTS = Object.freeze([
  Object.freeze({ key:'strahl', name:'Strahl', subtitle:'Merkez Topraklar', regionKey:'merkez', x:34.5, y:76.5, kind:'city' }),
  Object.freeze({ key:'royal-capital', name:'Kraliyet Başkenti', subtitle:'Merkez Topraklar', regionKey:'merkez', x:46.5, y:84, kind:'city' }),
  Object.freeze({ key:'waal', name:'Waal', subtitle:'Kuzey sınır şehri', regionKey:'merkez', x:52, y:66, kind:'city' }),
  Object.freeze({ key:'fabel-village', name:'Fabel Köyü', subtitle:'Kuzey Yaylaları', regionKey:'orman', x:29, y:48, kind:'city' }),
  Object.freeze({ key:'graf-granat', name:'Graf Granat Bölgesi', subtitle:'Kuzey Toprakları', regionKey:'harabeler', x:55, y:53, kind:'city' }),
  Object.freeze({ key:'aeusserst', name:'Äußerst', subtitle:'Kühl Bölgesi · Büyü Şehri', regionKey:'kuzey', x:68, y:38, kind:'city' }),
  Object.freeze({ key:'village-of-sword', name:'Kılıç Köyü', subtitle:'Schwer Dağları', regionKey:'yayla', x:76, y:66, kind:'city' }),
  Object.freeze({ key:'weise', name:'Weise', subtitle:'Altın Diyarı', regionKey:'yayla', x:79, y:49, kind:'city' }),
  Object.freeze({ key:'ende', name:'Ende', subtitle:'Kıtanın en kuzeyi', regionKey:'aus', x:88, y:15, kind:'city' }),
  Object.freeze({ key:'demon-kings-castle', name:'İblis Kralı’nın Şatosu', subtitle:'Ende', regionKey:'aus', x:88, y:23, kind:'city' })
]);

export const FRIEREN_WORLD_BOSS_LOCATIONS = Object.freeze({
  level_1: Object.freeze({ regionKey:'merkez', x:37, y:72, place:'Strahl yolu' }),
  level_10: Object.freeze({ regionKey:'harabeler', x:59, y:50, place:'Kralın Mezarı Harabeleri' }),
  level_20: Object.freeze({ regionKey:'kuzey', x:72, y:34, place:'Kühl geçitleri' }),
  level_35: Object.freeze({ regionKey:'yayla', x:80, y:61, place:'Schwer Dağları' }),
  level_50: Object.freeze({ regionKey:'aus', x:91, y:19, place:'Ende' }),
  'north-general': Object.freeze({ regionKey:'yayla', x:82, y:33, place:'Kuzey Platosu' }),
  'glass-wyrm': Object.freeze({ regionKey:'kuzey', x:64, y:44, place:'Offen Dağları' }),
  'fallen-mage': Object.freeze({ regionKey:'aus', x:84, y:18, place:'Ende yolu' }),
  zeldeila: Object.freeze({ regionKey:'aus', x:93, y:26, place:'Ende kuzey sırtı' }),
  domaltazor: Object.freeze({ regionKey:'harabeler', x:51, y:57, place:'Kadim harabeler' }),
  'the-fool': Object.freeze({ regionKey:'merkez', x:42, y:80, place:'Merkez Topraklar' })
});

export const FRIEREN_WORLD_DUNGEON_LOCATIONS = Object.freeze({
  level_1: Object.freeze({ regionKey:'merkez', x:39, y:83, place:'Merkez geçitleri' }),
  level_5: Object.freeze({ regionKey:'orman', x:24, y:55, place:'Größe Ormanı' }),
  level_15: Object.freeze({ regionKey:'harabeler', x:61, y:47, place:'Kralın Mezarı Harabeleri' }),
  level_30: Object.freeze({ regionKey:'aus', x:85, y:30, place:'Kuzey Platosu' })
});
