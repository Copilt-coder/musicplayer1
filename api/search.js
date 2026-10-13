import { CONFIG, sp, formatTrack, getItems, cursorIndex, getBlacklist, isBlocked, safe } from './_lib.js';

export default safe(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ results: [] });

  // Spotify limite la recherche à 10 résultats par page : on lit 2 pages pour compenser le filtre « explicite »
  const pages = await Promise.all([0, 10].map((offset) =>
    sp(`/search?type=track&limit=10&offset=${offset}&market=${CONFIG.market}&q=${encodeURIComponent(q)}`)
  ));
  const bl = await getBlacklist();
  const items = await getItems();
  const cur = await cursorIndex(items);
  const pos = new Map(items.map((t, i) => [t.id, i]));

  const seen = new Set();
  const results = pages
    .flatMap((p) => p?.tracks?.items || [])
    .filter((t) => t?.id && !seen.has(t.id) && seen.add(t.id))
    .map(formatTrack)
    .filter((t) => !(CONFIG.blockExplicit && t.explicit) && !isBlocked(t, bl))
    .slice(0, 8)
    .map((t) => ({ id: t.id, title: t.title, artist: t.artist, artwork: t.artwork, already: pos.has(t.id), played: pos.has(t.id) && pos.get(t.id) < cur }));
  res.json({ results });
});
