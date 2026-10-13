import { redis, CONFIG, sp, formatTrack, getItems, invalidate, cursorIndex, playlistId, getBlacklist, isBlocked, safe } from './_lib.js';

export default safe(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { songId, guestId } = req.body || {};
  const name = String(req.body?.name || '').trim().slice(0, 30);
  if (!/^[A-Za-z0-9]{22}$/.test(String(songId)) || !/^[\w-]{8,64}$/.test(String(guestId || ''))) {
    return res.status(400).json({ error: 'Demande invalide.' });
  }
  const id = String(songId);
const { songId, guestId, manualSong } = req.body || {};
  const name = String(req.body?.name || '').trim().slice(0, 30);

if (manualSong) {
    // Envoi transparent vers Make.com qui remplira le Google Sheet
    await fetch('https://hook.eu1.make.com/TON_LIEN_WEBHOOK', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invite: name || 'Anonyme',
        musique: manualSong,
        date: new Date().toLocaleString('fr-FR')
      })
    });
    return res.json({ message: 'Ta proposition a été ajoutée au tableur !' });
  }
  // Limite par invité
const usedKey = `guest:${guestId}`;
  /*  
  const used = Number(await redis.get(usedKey)) || 0;
  if (used >= CONFIG.maxPerGuest) {
  return res.status(429).json({ error: `Tu as utilisé tes ${CONFIG.maxPerGuest} demandes. Merci !` });
  } */

  const items = await getItems(true);
  const idx = items.findIndex((t) => t.id === id);

  // Anti-doublon : ça devient un « +1 »
  if (idx !== -1) {
    if (idx <= (await cursorIndex(items))) return res.status(409).json({ error: 'Cette chanson a déjà été jouée ce soir.' });
    const meta = (await redis.hget('meta', id)) || { votes: 1, voters: [], requestedBy: [] };
    if (meta.voters.includes(guestId)) return res.status(409).json({ error: 'Tu as déjà demandé cette chanson.' });
    meta.votes += 1;
    meta.voters.push(guestId);
    if (name) meta.requestedBy.push(name);
    await redis.hset('meta', { [id]: meta });
    await redis.incr(usedKey);
    return res.json({ message: 'Cette chanson était déjà dans la liste : ton +1 est ajouté !' });
  }

  // Nouvelle chanson : on la relit chez Spotify (on ne fait pas confiance au navigateur)
  let track;
  try { track = formatTrack(await sp(`/tracks/${id}`)); }
  catch { return res.status(404).json({ error: 'Chanson introuvable.' }); }
  if (CONFIG.blockExplicit && track.explicit) {
    return res.status(403).json({ error: 'Cette version contient des paroles explicites. Essaie une version « clean ».' });
  }
  if (isBlocked(track, await getBlacklist())) {
    return res.status(403).json({ error: 'Cette chanson ne peut pas être ajoutée.' });
  }

  await sp(`/playlists/${await playlistId()}/items`, { method: 'POST', body: { uris: [track.uri] } });
  await redis.hset('meta', { [id]: { votes: 1, voters: [guestId], requestedBy: name ? [name] : [], addedAt: Date.now() } });
  await redis.incr(usedKey);
  await invalidate();
  res.json({ message: `« ${track.title} » est dans la playlist !` });
});
