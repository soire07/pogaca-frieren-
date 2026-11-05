import { isIP } from 'node:net';

function normalizeIp(value) {
  let candidate = String(value || '').trim();
  if (candidate.startsWith('[') && candidate.endsWith(']')) candidate = candidate.slice(1, -1);
  if (candidate.toLowerCase().startsWith('::ffff:')) candidate = candidate.slice(7);
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

export function resolveVerifiedClientIp(req, {
  trustedProxyIps = String(process.env.GUARDIAN_TRUSTED_PROXY_IPS || process.env.SITE_TRUSTED_PROXY_IPS || '').split(','),
} = {}) {
  const peer = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress);
  if (!peer) return { clientIp: null, source: 'unverified_peer' };
  const trusted = new Set((Array.isArray(trustedProxyIps) ? trustedProxyIps : String(trustedProxyIps).split(','))
    .map(normalizeIp).filter(Boolean));
  if (!trusted.has(peer)) return { clientIp: peer, source: 'socket_peer' };

  const forwarded = String(req?.headers?.['x-forwarded-for'] || '');
  if (!forwarded || forwarded.length > 2048) return { clientIp: null, source: 'unverified_proxy' };
  const hops = forwarded.split(',').map(value => normalizeIp(value));
  if (!hops.length || hops.some(value => !value)) return { clientIp: null, source: 'unverified_proxy' };
  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index];
    if (trusted.has(hop)) continue;
    return { clientIp: hop, source: 'trusted_proxy' };
  }
  return { clientIp: null, source: 'unverified_proxy' };
}
