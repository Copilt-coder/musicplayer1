import { redis } from './_lib.js';

export default async function handler(req, res) {
  // Optionnel : tu peux rajouter ton if (!isAdmin(req)) ici pour protéger le fichier

  // On récupère toutes les entrées de la liste
  const requests = await redis.lrange('manual_requests', 0, -1);
  
  // On prépare le contenu Excel (CSV)
  // Le \uFEFF force Excel à bien lire les accents (UTF-8)
  let csv = '\uFEFFDate;Invité;Musique proposée\n';
  
  requests.forEach(r => {
    const data = JSON.parse(r);
    // On remplace les points-virgules dans le texte pour ne pas casser les colonnes Excel
    const safeSong = data.song.replace(/;/g, ','); 
    csv += `${data.date};${data.guest};${safeSong}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="musiques_introuvables.csv"');
  res.status(200).send(csv);
}
