import crypto from 'node:crypto';
import { redis, isAdmin, SCOPES, tokenRequest, sp } from './_lib.js';

export default async function handler(req, res) {
  // 1) La page admin demande l'adresse de connexion Spotify (protégé par mot de passe)
  if (req.method === 'POST') {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Mot de passe incorrect.' });
    const state = crypto.randomBytes(16).toString('hex');
    await redis.set(`oauth:${state}`, '1', { ex: 600 });
    const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID,
      scope: SCOPES,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      state,
      show_dialog: 'true',
    });
    return res.json({ url });
  }

  // 2) Spotify renvoie l'admin ici après son accord
  const { code, state, error } = req.query;
  if (error) return res.redirect('/admin.html?error=' + encodeURIComponent(error));
  const ok = state && (await redis.get(`oauth:${state}`));
  if (!ok || !code) return res.status(400).send('Lien invalide ou expiré. Recommencez depuis la page admin.');
  await redis.del(`oauth:${state}`);

  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: process.env.SPOTIFY_REDIRECT_URI });
    await redis.set('spotify:refresh', t.refresh_token);
    await redis.set('spotify:access', t.access_token, { ex: Math.max(60, (t.expires_in || 3600) - 300) });
    if (!(await redis.get('spotify:playlist'))) {
      const p = await sp('/me/playlists', {
        method: 'POST',
        body: { name: 'Mariage – demandes des invités', public: false, description: 'Alimentée par le site de demandes' },
      });
      await redis.set('spotify:playlist', String(p.id));
    }
    res.redirect('/admin.html?connected=1');
  } catch (e) {
    res.status(500).send('Échec de la connexion à Spotify : ' + e.message);
  }
}
