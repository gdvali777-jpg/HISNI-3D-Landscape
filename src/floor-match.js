// One rule for "which apartments does this floor show?"
// The tower highlight and the floor panel both use it, so a green floor cannot open empty.

export function floorNumber(floor) {
  const n = Number(floor);
  return Number.isFinite(n) ? n : null;
}

export function apartmentsOnFloor(apartments, blockId, floor) {
  const n = floorNumber(floor);
  if (!blockId || n == null) return [];
  return apartments.filter((a) => a.block === blockId && floorNumber(a.floor) === n);
}

export function freeOnFloor(apartments, blockId, floor) {
  return apartmentsOnFloor(apartments, blockId, floor).filter((a) => a.status === 'available');
}

export function floorIsGreen(apartments, blockId, floor) {
  return freeOnFloor(apartments, blockId, floor).length > 0;
}

/** What the floor panel lists. An empty status set means every apartment on the floor. */
export function listedOnFloor(apartments, blockId, floor, statuses) {
  const rows = apartmentsOnFloor(apartments, blockId, floor);
  if (!statuses || statuses.size === 0) return rows;
  return rows.filter((a) => statuses.has(a.status));
}
