import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

export const CONFIG = {
  market: process.env.SPOTIFY_MARKET || 'FR',
  maxPerGuest: parseInt(process.env.MAX_PER_GUEST || '3', 10),
  blockExplicit: process.env.BLOCK_EXPLICIT !== 'false',
};

export const SCOPES = [
  'playlist-read-private', 'playlist-modify-private', 'playlist-modify-public',
  'user-read-playback-state', 'user-read-currently-playing', 'user-modify-playback-state',
].join(' ');

export function isAdmin(req) {
  const pwd = process.env.ADMIN_PASSWORD;
  return Boolean(pwd) && req.headers['x-admin-password'] === pwd;
}

/* ---------- Gestion des erreurs ---------- */
export function friendly(e) {
  if (e.reason === 'NO_ACTIVE_DEVICE') return 'Aucun appareil Spotify actif. Ouvrez Spotify sur l’appareil des enceintes, lancez un titre, puis réessayez.';
  if (e.reason === 'PREMIUM_REQUIRED') return 'Cette action nécessite Spotify Premium.';
  if (e.status === 429) return 'Spotify demande de patienter quelques secondes.';
  return e.message || 'Erreur inattendue.';
}
export const safe = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    console.error(e);
    const st = e.spotify && e.status === 401 ? 502 : (e.status >= 400 && e.status < 600 ? e.status : 500);
    res.status(st).json({ error: friendly(e) });
  }
};
const notConnected = () => Object.assign(new Error('Spotify n’est pas encore connecté (page admin).'), { status: 503 });

/* ---------- Authentification Spotify (jeton de l'admin, stocké côté serveur) ---------- */
export async function tokenRequest(params) {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const d = await r.json();
  if (!r.ok) throw Object.assign(new Error(d.error_description || d.error || 'Erreur Spotify'), { status: 502 });
  return d;
}

async function accessToken() {
  const cached = await redis.get('spotify:access');
  if (cached) return String(cached);
  const refresh = await redis.get('spotify:refresh');
  if (!refresh) throw notConnected();
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: String(refresh) });
  if (t.refresh_token) await redis.set('spotify:refresh', t.refresh_token);
  await redis.set('spotify:access', t.access_token, { ex: Math.max(60, (t.expires_in || 3600) - 300) });
  return t.access_token;
}

export async function sp(path, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) {
    throw Object.assign(new Error(data?.error?.message || `Spotify ${r.status}`), {
      status: r.status, reason: data?.error?.reason, spotify: true,
    });
  }
  return data;
}

/* ---------- Playlist = source de vérité ---------- */
export async function playlistId() {
  const p = await redis.get('spotify:playlist');
  if (!p) throw notConnected();
  return String(p);
}

export function formatTrack(t) {
  const imgs = t.album?.images || [];
  const artists = (t.artists || []).map((a) => a.name);
  return {
    id: t.id,
    uri: t.uri || `spotify:track:${t.id}`,
    title: t.name,
    artist: artists.join(', '),
    artists: artists.map((a) => a.toLowerCase()),
    explicit: Boolean(t.explicit),
    artwork: (imgs[1] || imgs[0] || {}).url || null,
  };
}

// Contenu de la playlist (cache de 8 s pour ménager l'API ; fresh = lecture directe)
export async function getItems(fresh = false) {
  if (!fresh) {
    const c = await redis.get('cache:items');
    if (c) return c;
  }
  const pid = await playlistId();
  const out = [];
  for (let offset = 0; ; offset += 50) {
    const d = await sp(`/playlists/${pid}/items?limit=50&offset=${offset}`);
    const arr = d?.items || [];
    for (const e of arr) {
      const t = e.item || e.track;           // « item » depuis février 2026
      if (t?.id) out.push(formatTrack(t));
    }
    if (arr.length < 50 || !d.next) break;
  }
  await redis.set('cache:items', out, { ex: 8 });
  return out;
}
export const invalidate = () => redis.del('cache:items');

// Position du titre en cours (ou du dernier titre vu en lecture) dans la playlist
export async function cursorIndex(items) {
  const last = await redis.get('lastPlaying');
  return last ? items.findIndex((t) => t.id === String(last)) : -1;
}

/* ---------- Liste noire : { "song:ID": "Titre — Artiste", "artist:nom": "Artiste : Nom" } ---------- */
export async function getBlacklist() {
  return (await redis.hgetall('blacklist')) || {};
}
export function isBlocked(track, bl) {
  return `song:${track.id}` in bl || track.artists.some((a) => `artist:${a}` in bl);
}
