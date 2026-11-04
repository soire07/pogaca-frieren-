# Normalized Roadmap Capability Index

Generated from `feature-inventory.json` on 2026-11-04. This derived index preserves every original roadmap ID; it does not delete or replace the source inventory.

## Summary

- Planned records: **1,675**
- Normalized capability groups: **325**
- Repeated groups with all seven operation verbs: **225 groups / 1,575 records**
- Single-operation groups: **50 groups / 50 records**
- Standalone groups without an operation prefix: **50 groups / 50 records**
- Arithmetic: **1,575 + 50 + 50 = 1,675**
- The existing inventory contains 325 base implemented records plus 10 competitor-derived records, 5 social platform/web evidence records and 1 guild mini-game record (341 total). Equal counts do not prove semantic equivalence.

## Method and limits

Groups are keyed by category and lower-cased base name after removing only these leading verbs: `Preview`, `Unlock`, `Track`, `Compare`, `Customize`, `Earn milestones for`, and `Review history for`. Records without one of these prefixes remain standalone.

This is lexical normalization, not semantic deduplication. It does not prove that a capability is already implemented or that two similarly named capabilities behave the same. Each group still requires source-code, behavior-test and competitor-evidence comparison. Do not create seven separate game mechanics merely because seven operation records exist. Preserve all original roadmap IDs.

## Capability groups

| Category | Normalized capability | Planned operation forms | Original roadmap IDs |
|---|---|---|---|
| Arena | arena placement progress toward season rewards | Track | ROADMAP-1206 |
| Arena | arena rating changes before queueing | Preview | ROADMAP-1203 |
| Arena | class-restricted arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1142, ROADMAP-1151, ROADMAP-1160, ROADMAP-1169, ROADMAP-1178, ROADMAP-1187, ROADMAP-1196 |
| Arena | draft-pick arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1145, ROADMAP-1154, ROADMAP-1163, ROADMAP-1172, ROADMAP-1181, ROADMAP-1190, ROADMAP-1199 |
| Arena | duo-ranked arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1141, ROADMAP-1150, ROADMAP-1159, ROADMAP-1168, ROADMAP-1177, ROADMAP-1186, ROADMAP-1195 |
| Arena | equipment-capped arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1144, ROADMAP-1153, ROADMAP-1162, ROADMAP-1171, ROADMAP-1180, ROADMAP-1189, ROADMAP-1198 |
| Arena | matchup statistics between two classes | Compare | ROADMAP-1205 |
| Arena | Review a turn-by-turn arena match replay | Standalone | ROADMAP-1204 |
| Arena | season-final arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1148, ROADMAP-1157, ROADMAP-1166, ROADMAP-1175, ROADMAP-1184, ROADMAP-1193, ROADMAP-1202 |
| Arena | solo-ranked arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1140, ROADMAP-1149, ROADMAP-1158, ROADMAP-1167, ROADMAP-1176, ROADMAP-1185, ROADMAP-1194 |
| Arena | spell-only arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1143, ROADMAP-1152, ROADMAP-1161, ROADMAP-1170, ROADMAP-1179, ROADMAP-1188, ROADMAP-1197 |
| Arena | survival arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1146, ROADMAP-1155, ROADMAP-1164, ROADMAP-1173, ROADMAP-1182, ROADMAP-1191, ROADMAP-1200 |
| Arena | weekly-cup arena competition modes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1147, ROADMAP-1156, ROADMAP-1165, ROADMAP-1174, ROADMAP-1183, ROADMAP-1192, ROADMAP-1201 |
| Boss | a boss rematch with adjusted modifiers | Unlock | ROADMAP-0265 |
| Boss | boss clear times across party compositions | Compare | ROADMAP-0268 |
| Boss | boss-specific contribution and support scores | Track | ROADMAP-0266 |
| Boss | elemental-weakness boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0207, ROADMAP-0216, ROADMAP-0225, ROADMAP-0234, ROADMAP-0243, ROADMAP-0252, ROADMAP-0261 |
| Boss | elite boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0203, ROADMAP-0212, ROADMAP-0221, ROADMAP-0230, ROADMAP-0239, ROADMAP-0248, ROADMAP-0257 |
| Boss | entry-level boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0202, ROADMAP-0211, ROADMAP-0220, ROADMAP-0229, ROADMAP-0238, ROADMAP-0247, ROADMAP-0256 |
| Boss | final-phase boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0206, ROADMAP-0215, ROADMAP-0224, ROADMAP-0233, ROADMAP-0242, ROADMAP-0251, ROADMAP-0260 |
| Boss | legendary boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0204, ROADMAP-0213, ROADMAP-0222, ROADMAP-0231, ROADMAP-0240, ROADMAP-0249, ROADMAP-0258 |
| Boss | phase-two boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0205, ROADMAP-0214, ROADMAP-0223, ROADMAP-0232, ROADMAP-0241, ROADMAP-0250, ROADMAP-0259 |
| Boss | raid boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0210, ROADMAP-0219, ROADMAP-0228, ROADMAP-0237, ROADMAP-0246, ROADMAP-0255, ROADMAP-0264 |
| Boss | Review boss attack telegraphs before each phase | Standalone | ROADMAP-0267 |
| Boss | solo boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0209, ROADMAP-0218, ROADMAP-0227, ROADMAP-0236, ROADMAP-0245, ROADMAP-0254, ROADMAP-0263 |
| Boss | status-resistant boss encounter challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0208, ROADMAP-0217, ROADMAP-0226, ROADMAP-0235, ROADMAP-0244, ROADMAP-0253, ROADMAP-0262 |
| Co-op | cooperative activity completion by teammate | Track | ROADMAP-0402 |
| Co-op | Create a reusable cooperative party preset | Standalone | ROADMAP-0399 |
| Co-op | cross-class cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0343, ROADMAP-0352, ROADMAP-0361, ROADMAP-0370, ROADMAP-0379, ROADMAP-0388, ROADMAP-0397 |
| Co-op | damage-focused cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0342, ROADMAP-0351, ROADMAP-0360, ROADMAP-0369, ROADMAP-0378, ROADMAP-0387, ROADMAP-0396 |
| Co-op | four-player cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0338, ROADMAP-0347, ROADMAP-0356, ROADMAP-0365, ROADMAP-0374, ROADMAP-0383, ROADMAP-0392 |
| Co-op | guild cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0344, ROADMAP-0353, ROADMAP-0362, ROADMAP-0371, ROADMAP-0380, ROADMAP-0389, ROADMAP-0398 |
| Co-op | healer-led cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0340, ROADMAP-0349, ROADMAP-0358, ROADMAP-0367, ROADMAP-0376, ROADMAP-0385, ROADMAP-0394 |
| Co-op | Review each teammate's contribution after a run | Standalone | ROADMAP-0400 |
| Co-op | role-balanced cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0339, ROADMAP-0348, ROADMAP-0357, ROADMAP-0366, ROADMAP-0375, ROADMAP-0384, ROADMAP-0393 |
| Co-op | Set a party-ready check before encounter start | Standalone | ROADMAP-0401 |
| Co-op | tank-led cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0341, ROADMAP-0350, ROADMAP-0359, ROADMAP-0368, ROADMAP-0377, ROADMAP-0386, ROADMAP-0395 |
| Co-op | three-player cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0337, ROADMAP-0346, ROADMAP-0355, ROADMAP-0364, ROADMAP-0373, ROADMAP-0382, ROADMAP-0391 |
| Co-op | two-player cooperative party activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0336, ROADMAP-0345, ROADMAP-0354, ROADMAP-0363, ROADMAP-0372, ROADMAP-0381, ROADMAP-0390 |
| Collection | anime-series character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0877, ROADMAP-0886, ROADMAP-0895, ROADMAP-0904, ROADMAP-0913, ROADMAP-0922, ROADMAP-0931 |
| Collection | collection completion by anime series | Track | ROADMAP-0935 |
| Collection | collection progress with guild members | Compare | ROADMAP-0937 |
| Collection | common character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0872, ROADMAP-0881, ROADMAP-0890, ROADMAP-0899, ROADMAP-0908, ROADMAP-0917, ROADMAP-0926 |
| Collection | completionist character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0879, ROADMAP-0888, ROADMAP-0897, ROADMAP-0906, ROADMAP-0915, ROADMAP-0924, ROADMAP-0933 |
| Collection | Create a wishlist for undiscovered characters | Standalone | ROADMAP-0938 |
| Collection | duplicate-copy character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0878, ROADMAP-0887, ROADMAP-0896, ROADMAP-0905, ROADMAP-0914, ROADMAP-0923, ROADMAP-0932 |
| Collection | duplicate-copy conversion rewards | Preview | ROADMAP-0936 |
| Collection | epic character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0874, ROADMAP-0883, ROADMAP-0892, ROADMAP-0901, ROADMAP-0910, ROADMAP-0919, ROADMAP-0928 |
| Collection | event-exclusive character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0880, ROADMAP-0889, ROADMAP-0898, ROADMAP-0907, ROADMAP-0916, ROADMAP-0925, ROADMAP-0934 |
| Collection | legendary character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0875, ROADMAP-0884, ROADMAP-0893, ROADMAP-0902, ROADMAP-0911, ROADMAP-0920, ROADMAP-0929 |
| Collection | mysterious character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0876, ROADMAP-0885, ROADMAP-0894, ROADMAP-0903, ROADMAP-0912, ROADMAP-0921, ROADMAP-0930 |
| Collection | rare character collection goals | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0873, ROADMAP-0882, ROADMAP-0891, ROADMAP-0900, ROADMAP-0909, ROADMAP-0918, ROADMAP-0927 |
| Combat | boss-phase combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0143, ROADMAP-0152, ROADMAP-0161, ROADMAP-0170, ROADMAP-0179, ROADMAP-0188, ROADMAP-0197 |
| Combat | burst-damage combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0138, ROADMAP-0147, ROADMAP-0156, ROADMAP-0165, ROADMAP-0174, ROADMAP-0183, ROADMAP-0192 |
| Combat | combat outcomes across two builds | Compare | ROADMAP-0201 |
| Combat | counterattack combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0141, ROADMAP-0150, ROADMAP-0159, ROADMAP-0168, ROADMAP-0177, ROADMAP-0186, ROADMAP-0195 |
| Combat | defensive combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0137, ROADMAP-0146, ROADMAP-0155, ROADMAP-0164, ROADMAP-0173, ROADMAP-0182, ROADMAP-0191 |
| Combat | expected damage before committing a turn | Preview | ROADMAP-0198 |
| Combat | healing combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0139, ROADMAP-0148, ROADMAP-0157, ROADMAP-0166, ROADMAP-0175, ROADMAP-0184, ROADMAP-0193 |
| Combat | low-mana combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0142, ROADMAP-0151, ROADMAP-0160, ROADMAP-0169, ROADMAP-0178, ROADMAP-0187, ROADMAP-0196 |
| Combat | party combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0136, ROADMAP-0145, ROADMAP-0154, ROADMAP-0163, ROADMAP-0172, ROADMAP-0181, ROADMAP-0190 |
| Combat | Review a detailed combat turn timeline | Standalone | ROADMAP-0200 |
| Combat | Save reusable combat action sequences | Standalone | ROADMAP-0199 |
| Combat | solo combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0135, ROADMAP-0144, ROADMAP-0153, ROADMAP-0162, ROADMAP-0171, ROADMAP-0180, ROADMAP-0189 |
| Combat | status-effect combat tactics | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0140, ROADMAP-0149, ROADMAP-0158, ROADMAP-0167, ROADMAP-0176, ROADMAP-0185, ROADMAP-0194 |
| Community | charity-event community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1081, ROADMAP-1090, ROADMAP-1099, ROADMAP-1108, ROADMAP-1117, ROADMAP-1126, ROADMAP-1135 |
| Community | Collect community votes for the next themed activity | Standalone | ROADMAP-1139 |
| Community | Create community participation streaks | Standalone | ROADMAP-1136 |
| Community | creative community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1079, ROADMAP-1088, ROADMAP-1097, ROADMAP-1106, ROADMAP-1115, ROADMAP-1124, ROADMAP-1133 |
| Community | guild-hosted community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1076, ROADMAP-1085, ROADMAP-1094, ROADMAP-1103, ROADMAP-1112, ROADMAP-1121, ROADMAP-1130 |
| Community | monthly community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1074, ROADMAP-1083, ROADMAP-1092, ROADMAP-1101, ROADMAP-1110, ROADMAP-1119, ROADMAP-1128 |
| Community | newcomer community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1078, ROADMAP-1087, ROADMAP-1096, ROADMAP-1105, ROADMAP-1114, ROADMAP-1123, ROADMAP-1132 |
| Community | Nominate players for community recognition | Standalone | ROADMAP-1137 |
| Community | quiz community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1080, ROADMAP-1089, ROADMAP-1098, ROADMAP-1107, ROADMAP-1116, ROADMAP-1125, ROADMAP-1134 |
| Community | Review participation history across community events | Standalone | ROADMAP-1138 |
| Community | seasonal community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1075, ROADMAP-1084, ROADMAP-1093, ROADMAP-1102, ROADMAP-1111, ROADMAP-1120, ROADMAP-1129 |
| Community | server-wide community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1077, ROADMAP-1086, ROADMAP-1095, ROADMAP-1104, ROADMAP-1113, ROADMAP-1122, ROADMAP-1131 |
| Community | weekly community participation activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1073, ROADMAP-1082, ROADMAP-1091, ROADMAP-1100, ROADMAP-1109, ROADMAP-1118, ROADMAP-1127 |
| Companions | Assign companions to non-combat support tasks | Standalone | ROADMAP-1337 |
| Companions | boss-support companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1280, ROADMAP-1289, ROADMAP-1298, ROADMAP-1307, ROADMAP-1316, ROADMAP-1325, ROADMAP-1334 |
| Companions | companion loyalty and interaction milestones | Track | ROADMAP-1339 |
| Companions | companion synergy with the active class | Preview | ROADMAP-1338 |
| Companions | crafting-assistant companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1281, ROADMAP-1290, ROADMAP-1299, ROADMAP-1308, ROADMAP-1317, ROADMAP-1326, ROADMAP-1335 |
| Companions | explorer companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1279, ROADMAP-1288, ROADMAP-1297, ROADMAP-1306, ROADMAP-1315, ROADMAP-1324, ROADMAP-1333 |
| Companions | guardian companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1276, ROADMAP-1285, ROADMAP-1294, ROADMAP-1303, ROADMAP-1312, ROADMAP-1321, ROADMAP-1330 |
| Companions | healer companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1275, ROADMAP-1284, ROADMAP-1293, ROADMAP-1302, ROADMAP-1311, ROADMAP-1320, ROADMAP-1329 |
| Companions | mage companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1277, ROADMAP-1286, ROADMAP-1295, ROADMAP-1304, ROADMAP-1313, ROADMAP-1322, ROADMAP-1331 |
| Companions | merchant companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1278, ROADMAP-1287, ROADMAP-1296, ROADMAP-1305, ROADMAP-1314, ROADMAP-1323, ROADMAP-1332 |
| Companions | Review companion skill growth over time | Standalone | ROADMAP-1340 |
| Companions | scout companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1274, ROADMAP-1283, ROADMAP-1292, ROADMAP-1301, ROADMAP-1310, ROADMAP-1319, ROADMAP-1328 |
| Companions | story-companion companion progression systems | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1282, ROADMAP-1291, ROADMAP-1300, ROADMAP-1309, ROADMAP-1318, ROADMAP-1327, ROADMAP-1336 |
| Cosmetics | avatar-border cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1547, ROADMAP-1556, ROADMAP-1565, ROADMAP-1574, ROADMAP-1583, ROADMAP-1592, ROADMAP-1601 |
| Cosmetics | collection-display cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1550, ROADMAP-1559, ROADMAP-1568, ROADMAP-1577, ROADMAP-1586, ROADMAP-1595, ROADMAP-1604 |
| Cosmetics | cosmetic variants through non-paywalled play | Unlock | ROADMAP-1607 |
| Cosmetics | cosmetics on the profile before equipping | Preview | ROADMAP-1605 |
| Cosmetics | guild-banner cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1548, ROADMAP-1557, ROADMAP-1566, ROADMAP-1575, ROADMAP-1584, ROADMAP-1593, ROADMAP-1602 |
| Cosmetics | nameplate cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1543, ROADMAP-1552, ROADMAP-1561, ROADMAP-1570, ROADMAP-1579, ROADMAP-1588, ROADMAP-1597 |
| Cosmetics | profile-frame cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1542, ROADMAP-1551, ROADMAP-1560, ROADMAP-1569, ROADMAP-1578, ROADMAP-1587, ROADMAP-1596 |
| Cosmetics | Review cosmetic acquisition sources and dates | Standalone | ROADMAP-1608 |
| Cosmetics | Save cosmetic presets for different occasions | Standalone | ROADMAP-1606 |
| Cosmetics | seasonal-theme cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1549, ROADMAP-1558, ROADMAP-1567, ROADMAP-1576, ROADMAP-1585, ROADMAP-1594, ROADMAP-1603 |
| Cosmetics | spell-trail cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1545, ROADMAP-1554, ROADMAP-1563, ROADMAP-1572, ROADMAP-1581, ROADMAP-1590, ROADMAP-1599 |
| Cosmetics | title-effect cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1544, ROADMAP-1553, ROADMAP-1562, ROADMAP-1571, ROADMAP-1580, ROADMAP-1589, ROADMAP-1598 |
| Cosmetics | victory-pose cosmetic customization options | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1546, ROADMAP-1555, ROADMAP-1564, ROADMAP-1573, ROADMAP-1582, ROADMAP-1591, ROADMAP-1600 |
| Crafting | alchemy crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0604, ROADMAP-0613, ROADMAP-0622, ROADMAP-0631, ROADMAP-0640, ROADMAP-0649, ROADMAP-0658 |
| Crafting | blacksmithing crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0605, ROADMAP-0614, ROADMAP-0623, ROADMAP-0632, ROADMAP-0641, ROADMAP-0650, ROADMAP-0659 |
| Crafting | cooking crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0607, ROADMAP-0616, ROADMAP-0625, ROADMAP-0634, ROADMAP-0643, ROADMAP-0652, ROADMAP-0661 |
| Crafting | crafting success odds before consuming materials | Preview | ROADMAP-0667 |
| Crafting | enchanting crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0606, ROADMAP-0615, ROADMAP-0624, ROADMAP-0633, ROADMAP-0642, ROADMAP-0651, ROADMAP-0660 |
| Crafting | gathering crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0610, ROADMAP-0619, ROADMAP-0628, ROADMAP-0637, ROADMAP-0646, ROADMAP-0655, ROADMAP-0664 |
| Crafting | guild-workshop crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0612, ROADMAP-0621, ROADMAP-0630, ROADMAP-0639, ROADMAP-0648, ROADMAP-0657, ROADMAP-0666 |
| Crafting | inscription crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0608, ROADMAP-0617, ROADMAP-0626, ROADMAP-0635, ROADMAP-0644, ROADMAP-0653, ROADMAP-0662 |
| Crafting | masterwork crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0611, ROADMAP-0620, ROADMAP-0629, ROADMAP-0638, ROADMAP-0647, ROADMAP-0656, ROADMAP-0665 |
| Crafting | material costs across alternative recipes | Compare | ROADMAP-0670 |
| Crafting | recipe discovery sources and prerequisites | Track | ROADMAP-0669 |
| Crafting | recycling crafting profession recipes | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0609, ROADMAP-0618, ROADMAP-0627, ROADMAP-0636, ROADMAP-0645, ROADMAP-0654, ROADMAP-0663 |
| Crafting | Save a multi-step crafting production queue | Standalone | ROADMAP-0668 |
| Dungeon | advanced dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0270, ROADMAP-0279, ROADMAP-0288, ROADMAP-0297, ROADMAP-0306, ROADMAP-0315, ROADMAP-0324 |
| Dungeon | beginner dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0269, ROADMAP-0278, ROADMAP-0287, ROADMAP-0296, ROADMAP-0305, ROADMAP-0314, ROADMAP-0323 |
| Dungeon | boss-rush dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0274, ROADMAP-0283, ROADMAP-0292, ROADMAP-0301, ROADMAP-0310, ROADMAP-0319, ROADMAP-0328 |
| Dungeon | branching dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0271, ROADMAP-0280, ROADMAP-0289, ROADMAP-0298, ROADMAP-0307, ROADMAP-0316, ROADMAP-0325 |
| Dungeon | endless dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0277, ROADMAP-0286, ROADMAP-0295, ROADMAP-0304, ROADMAP-0313, ROADMAP-0322, ROADMAP-0331 |
| Dungeon | floor-by-floor dungeon resource usage | Track | ROADMAP-0334 |
| Dungeon | Review dungeon failure causes and recovery tips | Standalone | ROADMAP-0335 |
| Dungeon | route risks before entering a dungeon | Preview | ROADMAP-0332 |
| Dungeon | Save a preferred dungeon route for replay | Standalone | ROADMAP-0333 |
| Dungeon | survival dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0275, ROADMAP-0284, ROADMAP-0293, ROADMAP-0302, ROADMAP-0311, ROADMAP-0320, ROADMAP-0329 |
| Dungeon | time-limited dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0276, ROADMAP-0285, ROADMAP-0294, ROADMAP-0303, ROADMAP-0312, ROADMAP-0321, ROADMAP-0330 |
| Dungeon | trap-heavy dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0272, ROADMAP-0281, ROADMAP-0290, ROADMAP-0299, ROADMAP-0308, ROADMAP-0317, ROADMAP-0326 |
| Dungeon | treasure-focused dungeon route challenges | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0273, ROADMAP-0282, ROADMAP-0291, ROADMAP-0300, ROADMAP-0309, ROADMAP-0318, ROADMAP-0327 |
| Economy | auction player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0807, ROADMAP-0816, ROADMAP-0825, ROADMAP-0834, ROADMAP-0843, ROADMAP-0852, ROADMAP-0861 |
| Economy | bulk-order player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0811, ROADMAP-0820, ROADMAP-0829, ROADMAP-0838, ROADMAP-0847, ROADMAP-0856, ROADMAP-0865 |
| Economy | daily-deal player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0809, ROADMAP-0818, ROADMAP-0827, ROADMAP-0836, ROADMAP-0845, ROADMAP-0854, ROADMAP-0863 |
| Economy | guild-market player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0808, ROADMAP-0817, ROADMAP-0826, ROADMAP-0835, ROADMAP-0844, ROADMAP-0853, ROADMAP-0862 |
| Economy | limited-offer player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0810, ROADMAP-0819, ROADMAP-0828, ROADMAP-0837, ROADMAP-0846, ROADMAP-0855, ROADMAP-0864 |
| Economy | market player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0805, ROADMAP-0814, ROADMAP-0823, ROADMAP-0832, ROADMAP-0841, ROADMAP-0850, ROADMAP-0859 |
| Economy | merchant-reputation player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0813, ROADMAP-0822, ROADMAP-0831, ROADMAP-0840, ROADMAP-0849, ROADMAP-0858, ROADMAP-0867 |
| Economy | player-trade player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0806, ROADMAP-0815, ROADMAP-0824, ROADMAP-0833, ROADMAP-0842, ROADMAP-0851, ROADMAP-0860 |
| Economy | price-watch player economy activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0812, ROADMAP-0821, ROADMAP-0830, ROADMAP-0839, ROADMAP-0848, ROADMAP-0857, ROADMAP-0866 |
| Economy | recent sale prices for tradeable items | Compare | ROADMAP-0868 |
| Economy | Review a complete gold earning and spending ledger | Standalone | ROADMAP-0870 |
| Economy | Set a price alert for selected market goods | Standalone | ROADMAP-0869 |
| Economy | trade balance changes before confirming an offer | Preview | ROADMAP-0871 |
| Equipment | critical-strike equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0678, ROADMAP-0687, ROADMAP-0696, ROADMAP-0705, ROADMAP-0714, ROADMAP-0723, ROADMAP-0732 |
| Equipment | epic equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0673, ROADMAP-0682, ROADMAP-0691, ROADMAP-0700, ROADMAP-0709, ROADMAP-0718, ROADMAP-0727 |
| Equipment | equipment durability and repair history | Track | ROADMAP-0737 |
| Equipment | legendary equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0674, ROADMAP-0683, ROADMAP-0692, ROADMAP-0701, ROADMAP-0710, ROADMAP-0719, ROADMAP-0728 |
| Equipment | mana-focused equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0677, ROADMAP-0686, ROADMAP-0695, ROADMAP-0704, ROADMAP-0713, ROADMAP-0722, ROADMAP-0731 |
| Equipment | rare equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0672, ROADMAP-0681, ROADMAP-0690, ROADMAP-0699, ROADMAP-0708, ROADMAP-0717, ROADMAP-0726 |
| Equipment | resistance equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0676, ROADMAP-0685, ROADMAP-0694, ROADMAP-0703, ROADMAP-0712, ROADMAP-0721, ROADMAP-0730 |
| Equipment | Save named equipment presets for different encounters | Standalone | ROADMAP-0734 |
| Equipment | set-bonus equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0675, ROADMAP-0684, ROADMAP-0693, ROADMAP-0702, ROADMAP-0711, ROADMAP-0720, ROADMAP-0729 |
| Equipment | starter equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0671, ROADMAP-0680, ROADMAP-0689, ROADMAP-0698, ROADMAP-0707, ROADMAP-0716, ROADMAP-0725 |
| Equipment | stat changes before equipping an item | Preview | ROADMAP-0735 |
| Equipment | support equipment loadouts | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0679, ROADMAP-0688, ROADMAP-0697, ROADMAP-0706, ROADMAP-0715, ROADMAP-0724, ROADMAP-0733 |
| Equipment | two equipment sets with active set bonuses | Compare | ROADMAP-0736 |
| Events | anniversary limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1211, ROADMAP-1220, ROADMAP-1229, ROADMAP-1238, ROADMAP-1247, ROADMAP-1256, ROADMAP-1265 |
| Events | autumn limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1209, ROADMAP-1218, ROADMAP-1227, ROADMAP-1236, ROADMAP-1245, ROADMAP-1254, ROADMAP-1263 |
| Events | boss-invasion limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1215, ROADMAP-1224, ROADMAP-1233, ROADMAP-1242, ROADMAP-1251, ROADMAP-1260, ROADMAP-1269 |
| Events | collection-hunt limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1214, ROADMAP-1223, ROADMAP-1232, ROADMAP-1241, ROADMAP-1250, ROADMAP-1259, ROADMAP-1268 |
| Events | event currency and remaining time | Track | ROADMAP-1271 |
| Events | event reward tracks before participation | Preview | ROADMAP-1270 |
| Events | Frieren-themed limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1212, ROADMAP-1221, ROADMAP-1230, ROADMAP-1239, ROADMAP-1248, ROADMAP-1257, ROADMAP-1266 |
| Events | guild-race limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1213, ROADMAP-1222, ROADMAP-1231, ROADMAP-1240, ROADMAP-1249, ROADMAP-1258, ROADMAP-1267 |
| Events | Review a history of completed seasonal events | Standalone | ROADMAP-1273 |
| Events | Save event progress across temporary disconnects | Standalone | ROADMAP-1272 |
| Events | spring limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1207, ROADMAP-1216, ROADMAP-1225, ROADMAP-1234, ROADMAP-1243, ROADMAP-1252, ROADMAP-1261 |
| Events | summer limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1208, ROADMAP-1217, ROADMAP-1226, ROADMAP-1235, ROADMAP-1244, ROADMAP-1253, ROADMAP-1262 |
| Events | winter limited-time event activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1210, ROADMAP-1219, ROADMAP-1228, ROADMAP-1237, ROADMAP-1246, ROADMAP-1255, ROADMAP-1264 |
| Exploration | ancient-elf exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0409, ROADMAP-0418, ROADMAP-0427, ROADMAP-0436, ROADMAP-0445, ROADMAP-0454, ROADMAP-0463 |
| Exploration | Build a personal exploration route planner | Standalone | ROADMAP-0466 |
| Exploration | clues leading to undiscovered locations | Track | ROADMAP-0468 |
| Exploration | coastal exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0406, ROADMAP-0415, ROADMAP-0424, ROADMAP-0433, ROADMAP-0442, ROADMAP-0451, ROADMAP-0460 |
| Exploration | desert exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0407, ROADMAP-0416, ROADMAP-0425, ROADMAP-0434, ROADMAP-0443, ROADMAP-0452, ROADMAP-0461 |
| Exploration | discovery completion between regions | Compare | ROADMAP-0467 |
| Exploration | dragon-nest exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0410, ROADMAP-0419, ROADMAP-0428, ROADMAP-0437, ROADMAP-0446, ROADMAP-0455, ROADMAP-0464 |
| Exploration | forest exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0403, ROADMAP-0412, ROADMAP-0421, ROADMAP-0430, ROADMAP-0439, ROADMAP-0448, ROADMAP-0457 |
| Exploration | hidden-route exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0411, ROADMAP-0420, ROADMAP-0429, ROADMAP-0438, ROADMAP-0447, ROADMAP-0456, ROADMAP-0465 |
| Exploration | mountain exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0404, ROADMAP-0413, ROADMAP-0422, ROADMAP-0431, ROADMAP-0440, ROADMAP-0449, ROADMAP-0458 |
| Exploration | Review a chronological exploration journal by region | Standalone | ROADMAP-0469 |
| Exploration | ruins exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0405, ROADMAP-0414, ROADMAP-0423, ROADMAP-0432, ROADMAP-0441, ROADMAP-0450, ROADMAP-0459 |
| Exploration | snowfield exploration discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0408, ROADMAP-0417, ROADMAP-0426, ROADMAP-0435, ROADMAP-0444, ROADMAP-0453, ROADMAP-0462 |
| Housing | alchemy-lab personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1410, ROADMAP-1419, ROADMAP-1428, ROADMAP-1437, ROADMAP-1446, ROADMAP-1455, ROADMAP-1464 |
| Housing | functional home stations through progression | Unlock | ROADMAP-1474 |
| Housing | garden personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1412, ROADMAP-1421, ROADMAP-1430, ROADMAP-1439, ROADMAP-1448, ROADMAP-1457, ROADMAP-1466 |
| Housing | guild-hall personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1415, ROADMAP-1424, ROADMAP-1433, ROADMAP-1442, ROADMAP-1451, ROADMAP-1460, ROADMAP-1469 |
| Housing | library personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1409, ROADMAP-1418, ROADMAP-1427, ROADMAP-1436, ROADMAP-1445, ROADMAP-1454, ROADMAP-1463 |
| Housing | observatory personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1414, ROADMAP-1423, ROADMAP-1432, ROADMAP-1441, ROADMAP-1450, ROADMAP-1459, ROADMAP-1468 |
| Housing | Place earned trophies in a personal display room | Standalone | ROADMAP-1471 |
| Housing | Save multiple room decoration layouts | Standalone | ROADMAP-1472 |
| Housing | seasonal-room personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1416, ROADMAP-1425, ROADMAP-1434, ROADMAP-1443, ROADMAP-1452, ROADMAP-1461, ROADMAP-1470 |
| Housing | starter-room personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1408, ROADMAP-1417, ROADMAP-1426, ROADMAP-1435, ROADMAP-1444, ROADMAP-1453, ROADMAP-1462 |
| Housing | trophy-hall personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1411, ROADMAP-1420, ROADMAP-1429, ROADMAP-1438, ROADMAP-1447, ROADMAP-1456, ROADMAP-1465 |
| Housing | Visit another player's public home showcase | Standalone | ROADMAP-1473 |
| Housing | workshop personal home features | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1413, ROADMAP-1422, ROADMAP-1431, ROADMAP-1440, ROADMAP-1449, ROADMAP-1458, ROADMAP-1467 |
| Inventory | bound inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0743, ROADMAP-0752, ROADMAP-0761, ROADMAP-0770, ROADMAP-0779, ROADMAP-0788, ROADMAP-0797 |
| Inventory | consumable inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0739, ROADMAP-0748, ROADMAP-0757, ROADMAP-0766, ROADMAP-0775, ROADMAP-0784, ROADMAP-0793 |
| Inventory | crafting inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0741, ROADMAP-0750, ROADMAP-0759, ROADMAP-0768, ROADMAP-0777, ROADMAP-0786, ROADMAP-0795 |
| Inventory | Create custom inventory folders and labels | Standalone | ROADMAP-0801 |
| Inventory | equipment inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0745, ROADMAP-0754, ROADMAP-0763, ROADMAP-0772, ROADMAP-0781, ROADMAP-0790, ROADMAP-0799 |
| Inventory | Filter inventory by source and acquisition date | Standalone | ROADMAP-0802 |
| Inventory | item use effects before consuming a stack | Preview | ROADMAP-0803 |
| Inventory | quest-item inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0740, ROADMAP-0749, ROADMAP-0758, ROADMAP-0767, ROADMAP-0776, ROADMAP-0785, ROADMAP-0794 |
| Inventory | rare-loot inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0744, ROADMAP-0753, ROADMAP-0762, ROADMAP-0771, ROADMAP-0780, ROADMAP-0789, ROADMAP-0798 |
| Inventory | Review item movement and consumption history | Standalone | ROADMAP-0804 |
| Inventory | stacked-material inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0738, ROADMAP-0747, ROADMAP-0756, ROADMAP-0765, ROADMAP-0774, ROADMAP-0783, ROADMAP-0792 |
| Inventory | tradeable inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0742, ROADMAP-0751, ROADMAP-0760, ROADMAP-0769, ROADMAP-0778, ROADMAP-0787, ROADMAP-0796 |
| Inventory | treasure inventory management actions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0746, ROADMAP-0755, ROADMAP-0764, ROADMAP-0773, ROADMAP-0782, ROADMAP-0791, ROADMAP-0800 |
| Lore | ancient-elf world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1475, ROADMAP-1484, ROADMAP-1493, ROADMAP-1502, ROADMAP-1511, ROADMAP-1520, ROADMAP-1529 |
| Lore | artifact-origin world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1483, ROADMAP-1492, ROADMAP-1501, ROADMAP-1510, ROADMAP-1519, ROADMAP-1528, ROADMAP-1537 |
| Lore | Connect related lore entries in a world timeline | Standalone | ROADMAP-1539 |
| Lore | demon-culture world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1477, ROADMAP-1486, ROADMAP-1495, ROADMAP-1504, ROADMAP-1513, ROADMAP-1522, ROADMAP-1531 |
| Lore | first-class-exam world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1479, ROADMAP-1488, ROADMAP-1497, ROADMAP-1506, ROADMAP-1515, ROADMAP-1524, ROADMAP-1533 |
| Lore | hero-party world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1480, ROADMAP-1489, ROADMAP-1498, ROADMAP-1507, ROADMAP-1516, ROADMAP-1525, ROADMAP-1534 |
| Lore | lore entries from verified exploration clues | Unlock | ROADMAP-1538 |
| Lore | lost-grimoire world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1481, ROADMAP-1490, ROADMAP-1499, ROADMAP-1508, ROADMAP-1517, ROADMAP-1526, ROADMAP-1535 |
| Lore | magic-history world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1476, ROADMAP-1485, ROADMAP-1494, ROADMAP-1503, ROADMAP-1512, ROADMAP-1521, ROADMAP-1530 |
| Lore | northern-lands world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1478, ROADMAP-1487, ROADMAP-1496, ROADMAP-1505, ROADMAP-1514, ROADMAP-1523, ROADMAP-1532 |
| Lore | regional-folklore world lore discoveries | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1482, ROADMAP-1491, ROADMAP-1500, ROADMAP-1509, ROADMAP-1518, ROADMAP-1527, ROADMAP-1536 |
| Lore | Review source encounters for each discovered lore entry | Standalone | ROADMAP-1541 |
| Lore | unresolved lore mysteries and clue counts | Track | ROADMAP-1540 |
| Magic | advanced spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0070, ROADMAP-0079, ROADMAP-0088, ROADMAP-0097, ROADMAP-0106, ROADMAP-0115, ROADMAP-0124 |
| Magic | awakening spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0076, ROADMAP-0085, ROADMAP-0094, ROADMAP-0103, ROADMAP-0112, ROADMAP-0121, ROADMAP-0130 |
| Magic | Build a custom spell rotation from learned spells | Standalone | ROADMAP-0131 |
| Magic | class-bound spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0072, ROADMAP-0081, ROADMAP-0090, ROADMAP-0099, ROADMAP-0108, ROADMAP-0117, ROADMAP-0126 |
| Magic | combo-based spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0075, ROADMAP-0084, ROADMAP-0093, ROADMAP-0102, ROADMAP-0111, ROADMAP-0120, ROADMAP-0129 |
| Magic | elemental spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0068, ROADMAP-0077, ROADMAP-0086, ROADMAP-0095, ROADMAP-0104, ROADMAP-0113, ROADMAP-0122 |
| Magic | mana efficiency across spell loadouts | Compare | ROADMAP-0134 |
| Magic | mana-efficient spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0071, ROADMAP-0080, ROADMAP-0089, ROADMAP-0098, ROADMAP-0107, ROADMAP-0116, ROADMAP-0125 |
| Magic | rare spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0074, ROADMAP-0083, ROADMAP-0092, ROADMAP-0101, ROADMAP-0110, ROADMAP-0119, ROADMAP-0128 |
| Magic | region-taught spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0073, ROADMAP-0082, ROADMAP-0091, ROADMAP-0100, ROADMAP-0109, ROADMAP-0118, ROADMAP-0127 |
| Magic | spell combo damage before combat | Preview | ROADMAP-0132 |
| Magic | spell mastery use by encounter type | Track | ROADMAP-0133 |
| Magic | starter spell mastery paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0069, ROADMAP-0078, ROADMAP-0087, ROADMAP-0096, ROADMAP-0105, ROADMAP-0114, ROADMAP-0123 |
| Pets | arcane pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1343, ROADMAP-1352, ROADMAP-1361, ROADMAP-1370, ROADMAP-1379, ROADMAP-1388, ROADMAP-1397 |
| Pets | crafting pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1348, ROADMAP-1357, ROADMAP-1366, ROADMAP-1375, ROADMAP-1384, ROADMAP-1393, ROADMAP-1402 |
| Pets | dragon pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1344, ROADMAP-1353, ROADMAP-1362, ROADMAP-1371, ROADMAP-1380, ROADMAP-1389, ROADMAP-1398 |
| Pets | forest pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1341, ROADMAP-1350, ROADMAP-1359, ROADMAP-1368, ROADMAP-1377, ROADMAP-1386, ROADMAP-1395 |
| Pets | healing pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1345, ROADMAP-1354, ROADMAP-1363, ROADMAP-1372, ROADMAP-1381, ROADMAP-1390, ROADMAP-1399 |
| Pets | Name and customize a personal companion pet | Standalone | ROADMAP-1404 |
| Pets | pet cosmetic accessories through milestones | Unlock | ROADMAP-1407 |
| Pets | pet mood and care streaks | Track | ROADMAP-1405 |
| Pets | pet support bonuses before an encounter | Preview | ROADMAP-1406 |
| Pets | scouting pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1346, ROADMAP-1355, ROADMAP-1364, ROADMAP-1373, ROADMAP-1382, ROADMAP-1391, ROADMAP-1400 |
| Pets | seasonal pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1349, ROADMAP-1358, ROADMAP-1367, ROADMAP-1376, ROADMAP-1385, ROADMAP-1394, ROADMAP-1403 |
| Pets | snow pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1342, ROADMAP-1351, ROADMAP-1360, ROADMAP-1369, ROADMAP-1378, ROADMAP-1387, ROADMAP-1396 |
| Pets | treasure-hunting pet care and progression activities | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1347, ROADMAP-1356, ROADMAP-1365, ROADMAP-1374, ROADMAP-1383, ROADMAP-1392, ROADMAP-1401 |
| Progression | boss-victory player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0944, ROADMAP-0953, ROADMAP-0962, ROADMAP-0971, ROADMAP-0980, ROADMAP-0989, ROADMAP-0998 |
| Progression | crafting player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0947, ROADMAP-0956, ROADMAP-0965, ROADMAP-0974, ROADMAP-0983, ROADMAP-0992, ROADMAP-1001 |
| Progression | current progress with the next level threshold | Compare | ROADMAP-1004 |
| Progression | daily-streak player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0942, ROADMAP-0951, ROADMAP-0960, ROADMAP-0969, ROADMAP-0978, ROADMAP-0987, ROADMAP-0996 |
| Progression | dungeon-clear player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0945, ROADMAP-0954, ROADMAP-0963, ROADMAP-0972, ROADMAP-0981, ROADMAP-0990, ROADMAP-0999 |
| Progression | exploration player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0946, ROADMAP-0955, ROADMAP-0964, ROADMAP-0973, ROADMAP-0982, ROADMAP-0991, ROADMAP-1000 |
| Progression | level player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0939, ROADMAP-0948, ROADMAP-0957, ROADMAP-0966, ROADMAP-0975, ROADMAP-0984, ROADMAP-0993 |
| Progression | missed and recovered progression objectives | Track | ROADMAP-1003 |
| Progression | Review all one-time milestone claims in one timeline | Standalone | ROADMAP-1005 |
| Progression | stat-point player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0941, ROADMAP-0950, ROADMAP-0959, ROADMAP-0968, ROADMAP-0977, ROADMAP-0986, ROADMAP-0995 |
| Progression | the next five progression milestones | Preview | ROADMAP-1002 |
| Progression | weekly-streak player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0943, ROADMAP-0952, ROADMAP-0961, ROADMAP-0970, ROADMAP-0979, ROADMAP-0988, ROADMAP-0997 |
| Progression | XP player progression milestones | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0940, ROADMAP-0949, ROADMAP-0958, ROADMAP-0967, ROADMAP-0976, ROADMAP-0985, ROADMAP-0994 |
| Quests | boss-hunt quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0478, ROADMAP-0487, ROADMAP-0496, ROADMAP-0505, ROADMAP-0514, ROADMAP-0523, ROADMAP-0532 |
| Quests | class quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0473, ROADMAP-0482, ROADMAP-0491, ROADMAP-0500, ROADMAP-0509, ROADMAP-0518, ROADMAP-0527 |
| Quests | collection quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0475, ROADMAP-0484, ROADMAP-0493, ROADMAP-0502, ROADMAP-0511, ROADMAP-0520, ROADMAP-0529 |
| Quests | crafting quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0476, ROADMAP-0485, ROADMAP-0494, ROADMAP-0503, ROADMAP-0512, ROADMAP-0521, ROADMAP-0530 |
| Quests | Create a multi-stage personal quest checklist | Standalone | ROADMAP-0533 |
| Quests | daily quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0470, ROADMAP-0479, ROADMAP-0488, ROADMAP-0497, ROADMAP-0506, ROADMAP-0515, ROADMAP-0524 |
| Quests | exploration quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0477, ROADMAP-0486, ROADMAP-0495, ROADMAP-0504, ROADMAP-0513, ROADMAP-0522, ROADMAP-0531 |
| Quests | guild quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0474, ROADMAP-0483, ROADMAP-0492, ROADMAP-0501, ROADMAP-0510, ROADMAP-0519, ROADMAP-0528 |
| Quests | objective dependencies across quest chains | Track | ROADMAP-0535 |
| Quests | quest prerequisites before accepting | Preview | ROADMAP-0534 |
| Quests | Review reward history for completed quest stages | Standalone | ROADMAP-0536 |
| Quests | story quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0472, ROADMAP-0481, ROADMAP-0490, ROADMAP-0499, ROADMAP-0508, ROADMAP-0517, ROADMAP-0526 |
| Quests | weekly quest objectives | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0471, ROADMAP-0480, ROADMAP-0489, ROADMAP-0498, ROADMAP-0507, ROADMAP-0516, ROADMAP-0525 |
| RPG | awakening character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0005, ROADMAP-0014, ROADMAP-0023, ROADMAP-0032, ROADMAP-0041, ROADMAP-0050, ROADMAP-0059 |
| RPG | build-specific character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0003, ROADMAP-0012, ROADMAP-0021, ROADMAP-0030, ROADMAP-0039, ROADMAP-0048, ROADMAP-0057 |
| RPG | class-specific character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0002, ROADMAP-0011, ROADMAP-0020, ROADMAP-0029, ROADMAP-0038, ROADMAP-0047, ROADMAP-0056 |
| RPG | equipment-synergy character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0006, ROADMAP-0015, ROADMAP-0024, ROADMAP-0033, ROADMAP-0042, ROADMAP-0051, ROADMAP-0060 |
| RPG | Generate a personalized RPG progression plan | Standalone | ROADMAP-0064 |
| RPG | level-gated character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0004, ROADMAP-0013, ROADMAP-0022, ROADMAP-0031, ROADMAP-0040, ROADMAP-0049, ROADMAP-0058 |
| RPG | prestige character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0009, ROADMAP-0018, ROADMAP-0027, ROADMAP-0036, ROADMAP-0045, ROADMAP-0054, ROADMAP-0063 |
| RPG | Review a player's full RPG progression timeline | Standalone | ROADMAP-0067 |
| RPG | role-based character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0007, ROADMAP-0016, ROADMAP-0025, ROADMAP-0034, ROADMAP-0043, ROADMAP-0052, ROADMAP-0061 |
| RPG | seasonal character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0008, ROADMAP-0017, ROADMAP-0026, ROADMAP-0035, ROADMAP-0044, ROADMAP-0053, ROADMAP-0062 |
| RPG | Set reminders for unspent RPG stat points | Standalone | ROADMAP-0066 |
| RPG | starter character progression paths | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0001, ROADMAP-0010, ROADMAP-0019, ROADMAP-0028, ROADMAP-0037, ROADMAP-0046, ROADMAP-0055 |
| RPG | two saved RPG character builds | Compare | ROADMAP-0065 |
| Social | Create a public player achievement showcase | Standalone | ROADMAP-1069 |
| Social | Follow a player's public progression milestones | Standalone | ROADMAP-1072 |
| Social | friend player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1006, ROADMAP-1015, ROADMAP-1024, ROADMAP-1033, ROADMAP-1042, ROADMAP-1051, ROADMAP-1060 |
| Social | guildmate player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1009, ROADMAP-1018, ROADMAP-1027, ROADMAP-1036, ROADMAP-1045, ROADMAP-1054, ROADMAP-1063 |
| Social | mentor player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1008, ROADMAP-1017, ROADMAP-1026, ROADMAP-1035, ROADMAP-1044, ROADMAP-1053, ROADMAP-1062 |
| Social | mutual-achievement player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1014, ROADMAP-1023, ROADMAP-1032, ROADMAP-1041, ROADMAP-1050, ROADMAP-1059, ROADMAP-1068 |
| Social | newcomer player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1011, ROADMAP-1020, ROADMAP-1029, ROADMAP-1038, ROADMAP-1047, ROADMAP-1056, ROADMAP-1065 |
| Social | party-member player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1010, ROADMAP-1019, ROADMAP-1028, ROADMAP-1037, ROADMAP-1046, ROADMAP-1055, ROADMAP-1064 |
| Social | returning-player player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1012, ROADMAP-1021, ROADMAP-1030, ROADMAP-1039, ROADMAP-1048, ROADMAP-1057, ROADMAP-1066 |
| Social | rival player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1007, ROADMAP-1016, ROADMAP-1025, ROADMAP-1034, ROADMAP-1043, ROADMAP-1052, ROADMAP-1061 |
| Social | Share a selected adventure recap with the server | Standalone | ROADMAP-1071 |
| Social | top-ranked player social interactions | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1013, ROADMAP-1022, ROADMAP-1031, ROADMAP-1040, ROADMAP-1049, ROADMAP-1058, ROADMAP-1067 |
| Social | two players' public RPG profiles | Compare | ROADMAP-1070 |
| Story | alternate story endings in a personal archive | Track | ROADMAP-0601 |
| Story | consequences of a story choice before confirming | Preview | ROADMAP-0600 |
| Story | Eisen branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0542, ROADMAP-0551, ROADMAP-0560, ROADMAP-0569, ROADMAP-0578, ROADMAP-0587, ROADMAP-0596 |
| Story | Fern branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0538, ROADMAP-0547, ROADMAP-0556, ROADMAP-0565, ROADMAP-0574, ROADMAP-0583, ROADMAP-0592 |
| Story | First-Class-Mage branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0545, ROADMAP-0554, ROADMAP-0563, ROADMAP-0572, ROADMAP-0581, ROADMAP-0590, ROADMAP-0599 |
| Story | Frieren branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0537, ROADMAP-0546, ROADMAP-0555, ROADMAP-0564, ROADMAP-0573, ROADMAP-0582, ROADMAP-0591 |
| Story | Heiter branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0541, ROADMAP-0550, ROADMAP-0559, ROADMAP-0568, ROADMAP-0577, ROADMAP-0586, ROADMAP-0595 |
| Story | Himmel branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0540, ROADMAP-0549, ROADMAP-0558, ROADMAP-0567, ROADMAP-0576, ROADMAP-0585, ROADMAP-0594 |
| Story | Northern-Plateau branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0544, ROADMAP-0553, ROADMAP-0562, ROADMAP-0571, ROADMAP-0580, ROADMAP-0589, ROADMAP-0598 |
| Story | Replay a completed chapter with a different choice | Standalone | ROADMAP-0602 |
| Story | Serie branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0543, ROADMAP-0552, ROADMAP-0561, ROADMAP-0570, ROADMAP-0579, ROADMAP-0588, ROADMAP-0597 |
| Story | Stark branching story chapters | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-0539, ROADMAP-0548, ROADMAP-0557, ROADMAP-0566, ROADMAP-0575, ROADMAP-0584, ROADMAP-0593 |
| Story | story paths without overwriting the active save | Compare | ROADMAP-0603 |
| Web | activity-history web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1617, ROADMAP-1626, ROADMAP-1635, ROADMAP-1644, ROADMAP-1653, ROADMAP-1662, ROADMAP-1671 |
| Web | arena web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1615, ROADMAP-1624, ROADMAP-1633, ROADMAP-1642, ROADMAP-1651, ROADMAP-1660, ROADMAP-1669 |
| Web | collection web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1614, ROADMAP-1623, ROADMAP-1632, ROADMAP-1641, ROADMAP-1650, ROADMAP-1659, ROADMAP-1668 |
| Web | Configure privacy controls for public profile fields | Standalone | ROADMAP-1675 |
| Web | crafting web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1612, ROADMAP-1621, ROADMAP-1630, ROADMAP-1639, ROADMAP-1648, ROADMAP-1657, ROADMAP-1666 |
| Web | Export personal RPG records in a portable format | Standalone | ROADMAP-1674 |
| Web | Filter player history by date and activity type | Standalone | ROADMAP-1673 |
| Web | guild web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1616, ROADMAP-1625, ROADMAP-1634, ROADMAP-1643, ROADMAP-1652, ROADMAP-1661, ROADMAP-1670 |
| Web | inventory web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1610, ROADMAP-1619, ROADMAP-1628, ROADMAP-1637, ROADMAP-1646, ROADMAP-1655, ROADMAP-1664 |
| Web | market web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1613, ROADMAP-1622, ROADMAP-1631, ROADMAP-1640, ROADMAP-1649, ROADMAP-1658, ROADMAP-1667 |
| Web | profile web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1609, ROADMAP-1618, ROADMAP-1627, ROADMAP-1636, ROADMAP-1645, ROADMAP-1654, ROADMAP-1663 |
| Web | quest web panel player tools | Preview, Unlock, Track, Compare, Customize, Earn milestones, Review history | ROADMAP-1611, ROADMAP-1620, ROADMAP-1629, ROADMAP-1638, ROADMAP-1647, ROADMAP-1656, ROADMAP-1665 |
| Web | View live RPG progress in a responsive mobile panel | Standalone | ROADMAP-1672 |
