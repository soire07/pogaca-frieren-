/**
 * Fan-made cartographic placements for canon Frieren locations and the bot's RPG encounters.
 * Coordinates are percentages on the 3:2 atlas artwork, not claims of official map coordinates.
 */
export const FRIEREN_WORLD_SETTLEMENTS = Object.freeze([
  Object.freeze({ key:'strahl', name:'Strahl', subtitle:'Merkez Topraklar', regionKey:'merkez', x:39, y:79, kind:'city' }),
  Object.freeze({ key:'royal-capital', name:'Kraliyet Başkenti', subtitle:'Merkez Topraklar', regionKey:'merkez', x:49, y:88, kind:'city' }),
  Object.freeze({ key:'waal', name:'Waal', subtitle:'Kuzey sınır şehri', regionKey:'merkez', x:51, y:63, kind:'city' }),
  Object.freeze({ key:'fabel-village', name:'Fabel Köyü', subtitle:'Kuzey Toprakları', regionKey:'kuzey', x:51, y:48, kind:'city' }),
  Object.freeze({ key:'graf-granat', name:'Graf Granat Bölgesi', subtitle:'Kuzey Toprakları', regionKey:'harabeler', x:55, y:58, kind:'city' }),
  Object.freeze({ key:'aeusserst', name:'Äußerst', subtitle:'Kühl Bölgesi · Büyü Şehri', regionKey:'kuzey', x:68, y:42, kind:'city' }),
  Object.freeze({ key:'village-of-sword', name:'Kılıç Köyü', subtitle:'Schwer Dağları', regionKey:'yayla', x:75, y:62, kind:'city' }),
  Object.freeze({ key:'weise', name:'Weise', subtitle:'Kuzey Platosu · Kale Şehri', regionKey:'yayla', x:82, y:46, kind:'city' }),
  Object.freeze({ key:'ende', name:'Ende', subtitle:'Kıtanın en kuzeyi', regionKey:'aus', x:88, y:15, kind:'city' }),
  Object.freeze({ key:'demon-kings-castle', name:'İblis Kralı’nın Şatosu', subtitle:'Ende', regionKey:'aus', x:94, y:24, kind:'city' })
]);

export const FRIEREN_WORLD_BOSS_LOCATIONS = Object.freeze({
  level_1: Object.freeze({ regionKey:'merkez', x:43, y:72, place:'Strahl yolu' }),
  level_10: Object.freeze({ regionKey:'harabeler', x:60, y:43, place:'Kralın Mezarı Harabeleri' }),
  level_20: Object.freeze({ regionKey:'kuzey', x:75, y:34, place:'Kühl geçitleri' }),
  level_35: Object.freeze({ regionKey:'yayla', x:86, y:68, place:'Schwer Dağları' }),
  level_50: Object.freeze({ regionKey:'aus', x:88, y:30, place:'Ende' }),
  'north-general': Object.freeze({ regionKey:'yayla', x:80, y:25, place:'Kuzey Platosu' }),
  'glass-wyrm': Object.freeze({ regionKey:'kuzey', x:62, y:49, place:'Offen Dağları' }),
  'fallen-mage': Object.freeze({ regionKey:'aus', x:78, y:20, place:'Ende yolu' }),
  zeldeila: Object.freeze({ regionKey:'aus', x:95, y:36, place:'Ende kuzey sırtı' }),
  domaltazor: Object.freeze({ regionKey:'harabeler', x:48, y:57, place:'Kadim harabeler' }),
  'the-fool': Object.freeze({ regionKey:'merkez', x:45, y:86, place:'Merkez Topraklar' })
});

export const FRIEREN_WORLD_DUNGEON_LOCATIONS = Object.freeze({
  level_1: Object.freeze({ regionKey:'merkez', x:38, y:88, place:'Merkez geçitleri' }),
  level_5: Object.freeze({ regionKey:'orman', x:21, y:58, place:'Größe Ormanı' }),
  level_15: Object.freeze({ regionKey:'harabeler', x:64, y:56, place:'Kralın Mezarı Harabeleri' }),
  level_30: Object.freeze({ regionKey:'aus', x:92, y:44, place:'Kuzey Platosu' })
});
