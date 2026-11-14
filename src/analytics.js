// No-op analytics. Pushes events onto dataLayer for a future tag manager.
// No GA or GTM script is loaded, and no ID is embedded.
export function track(event, params = {}) {
  const payload = { event, ...params };
  (window.dataLayer = window.dataLayer || []).push(payload);
  return payload;
}
