import { redis, CONFIG, sp, getItems, cursorIndex, isAdmin, safe } from './_lib.js';

export default safe(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const wantsAdmin = Boolean(req.headers['x-admin-password']);
  if (wantsAdmin && !isAdmin(req)) return res.status(401).json({ error: 'Mot de passe incorrect.' });

  const connected = Boolean(await redis.get('spotify:refresh')) && Boolean(await redis.get('spotify:playlist'));
  if (!connected) return res.json({ connected: false, list: [], remaining: 0, blacklist: {} });

  const items = await getItems();
  const meta = (await redis.hgetall('meta')) || {};

  if (wantsAdmin) {
    let isPlaying = false;
    try {
      const p = await sp('/me/player/currently-playing');
      isPlaying = Boolean(p?.is_playing);
      if (p?.item?.id && items.some((t) => t.id === p.item.id)) await redis.set('lastPlaying', p.item.id);
    } catch {}
    const cur = await cursorIndex(items);
    const pid = String(await redis.get('spotify:playlist'));
    return res.json({
      connected: true,
      isPlaying,
      playlistUrl: `https://open.spotify.com/playlist/${pid}`,
      blacklist: (await redis.hgetall('blacklist')) || {},
      list: items.map((t, i) => ({
        id: t.id, title: t.title, artist: t.artist, artwork: t.artwork,
        votes: meta[t.id]?.votes || 1,
        requestedBy: meta[t.id]?.requestedBy || [],
        status: i < cur ? 'played' : i === cur ? 'now' : 'next',
      })),
    });
  }

  const cur = await cursorIndex(items);
  const gid = String(req.query.guestId || '');
  const used = gid ? Number(await redis.get(`guest:${gid}`)) || 0 : 0;
  const rows = items.map((t, i) => ({
    id: t.id, title: t.title, artist: t.artist, artwork: t.artwork,
    votes: meta[t.id]?.votes || 1, played: i < cur, now: i === cur,
  }));
  res.json({
    connected: true,
    list: [...rows.filter((r) => !r.played), ...rows.filter((r) => r.played)],
    remaining: Math.max(0, CONFIG.maxPerGuest - used),
  });
});
