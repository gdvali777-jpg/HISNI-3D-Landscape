// URL parameters that reach the DOM. Only these values are accepted; anything else is dropped.
export const BLOCK_IDS = ['I', 'II', 'III', 'IV'];
const VIEWS = new Set(['intro', 'towers', 'block', 'floor', 'neighborhood', '3d', 'render']);

export function validBlock(value) {
  const id = String(value || '').trim();
  return BLOCK_IDS.includes(id) ? id : null;
}

export function validFloor(value) {
  if (value == null || String(value).trim() === '') return null;
  if (!/^\d{1,2}$/.test(String(value).trim())) return null;
  const n = Number(value);
  return n >= 6 && n <= 36 ? n : null;
}

export function validView(value) {
  return VIEWS.has(value) ? value : null;
}

export function validAptId(value) {
  const id = String(value || '').trim();
  return /^B[1-4]-\d{2}-\d{3}$/.test(id) ? id : null;
}
