export function buildCoopTestUserIds(index, primaryUserId, prefix = '900000000000') {
  const group = String(index).padStart(4, '0');
  const ids = [
    primaryUserId,
    prefix + group + '02',
    prefix + group + '03'
  ];
  if (new Set(ids).size !== ids.length) {
    throw new Error('Co-op test fixture generated duplicate player IDs.');
  }
  return ids;
}
