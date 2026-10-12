import { redis, sp, getItems, invalidate, cursorIndex, playlistId, isAdmin, safe } from './_lib.js';

const moveItem = async (pid, from, to) =>
  sp(`/playlists/${pid}/items`, { method: 'PUT', body: { range_start: from, insert_before: to, range_length: 1 } });

async function removeUris(pid, uris) {
  for (let i = 0; i < uris.length; i += 100) {
    await sp(`/playlists/${pid}/items`, { method: 'DELETE', body: { items: uris.slice(i, i + 100).map((uri) => ({ uri })) } });
  }
}

export default safe(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!isAdmin(req)) return res.status(401).json({ error: 'Mot de passe incorrect.' });
  const { action, id, dir, mode, entry, cmd } = req.body || {};
  const sid = id ? String(id) : null;
  const pid = await playlistId();

  switch (action) {
    case 'move': {
      const items = await getItems(true);
      const cur = await cursorIndex(items);
      const i = items.findIndex((t) => t.id === sid);
      if (i < 0) return res.status(404).json({ error: 'Titre introuvable (déjà retiré ?).' });
      if (dir === 'up' && i > cur + 1) await moveItem(pid, i, i - 1);
      if (dir === 'down' && i < items.length - 1) await moveItem(pid, i, i + 2);
      if (dir === 'top' && i > cur + 1) await moveItem(pid, i, cur + 1);
      break;
    }
    case 'sort': {
      const items = await getItems(true);
      const cur = await cursorIndex(items);
      const meta = (await redis.hgetall('meta')) || {};
      const desired = items.slice(cur + 1).sort((a, b) => (meta[b.id]?.votes || 1) - (meta[a.id]?.votes || 1));
      const work = [...items];
      for (let k = 0; k < desired.length; k++) {
        const pos = cur + 1 + k;
        if (work[pos].id !== desired[k].id) {
          const from = work.findIndex((t) => t.id === desired[k].id);
          await moveItem(pid, from, pos);
          const [x] = work.splice(from, 1);
          work.splice(pos, 0, x);
        }
      }
      break;
    }
    case 'remove': {
      const items = await getItems(true);
      const t = items.find((x) => x.id === sid);
      if (!t) break;
      let toRemove = [t];
      if (mode === 'song') {
        await redis.hset('blacklist', { [`song:${sid}`]: `${t.title} — ${t.artist}` });
      }
      if (mode === 'artist') {
        const a = t.artists[0];
        await redis.hset('blacklist', { [`artist:${a}`]: `Artiste : ${t.artist.split(', ')[0]}` });
        toRemove = items.filter((x) => x.artists.includes(a));
      }
      await removeUris(pid, toRemove.map((x) => x.uri));
      for (const x of toRemove) await redis.hdel('meta', x.id);
      break;
    }
    case 'unban':
      await redis.hdel('blacklist', String(entry));
      break;
    case 'player': {
      if (cmd === 'play-playlist') {
        const items = await getItems(true);
        const cur = await cursorIndex(items);
        await sp('/me/player/play', { method: 'PUT', body: { context_uri: `spotify:playlist:${pid}`, offset: { position: Math.max(0, cur) } } });
      } else if (cmd === 'resume') await sp('/me/player/play', { method: 'PUT' });
      else if (cmd === 'pause') await sp('/me/player/pause', { method: 'PUT' });
      else if (cmd === 'next') await sp('/me/player/next', { method: 'POST' });
      else return res.status(400).json({ error: 'Commande inconnue.' });
      break;
    }
    default:
      return res.status(400).json({ error: 'Action inconnue.' });
  }
  await invalidate();
  res.json({ ok: true });
});
