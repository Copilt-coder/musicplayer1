# Playlist de mariage (Spotify)

Les invités scannent un QR code, cherchent une chanson (titre + artiste), choisissent dans les suggestions et elle est ajoutée
à une **playlist Spotify**. La playlist est la source de vérité : vous pouvez aussi la modifier directement dans l'app Spotify.
La page `/admin.html` permet de réordonner, retirer, interdire, trier par popularité et piloter la lecture.

## 1. Spotify (une seule fois)
1. Un compte **Spotify Premium** est obligatoire : depuis février 2026, le propriétaire d'une app en « Development Mode » doit être Premium.
   (L'accès à l'API et la création de l'app sont gratuits.)
2. developer.spotify.com/dashboard > **Create app** > cochez **Web API**.
3. Notez le **Client ID** et le **Client secret**.
4. Ajoutez la **Redirect URI** une fois le site déployé : `https://VOTRE-SITE.vercel.app/api/auth`
   (elle doit être identique, au caractère près, à `SPOTIFY_REDIRECT_URI`).
5. Le compte qui se connecte sur la page admin doit être le propriétaire de l'app (sinon ajoutez-le dans « User Management », 5 comptes maximum). Les invités n'ont besoin de rien.

## 2. Déploiement (gratuit)
1. Mettez ce dossier sur GitHub, importez-le dans **Vercel**, déployez une première fois pour obtenir l'adresse du site.
2. Vercel > Storage > ajoutez **Upstash Redis** (offre gratuite).
3. Vercel > Settings > Environment Variables : copiez celles de `.env.example` (avec la vraie adresse dans `SPOTIFY_REDIRECT_URI`).
4. Redéployez. Le site invités est à la racine, l'admin à `/admin.html`.
5. Sur `/admin.html` : mot de passe > **Connecter Spotify** > acceptez. La playlist « Mariage – demandes des invités » est créée automatiquement.

## 3. QR code
`npm install` puis `node scripts/make-qr.js https://votre-site.vercel.app`

## 4. Le soir J
- Ouvrez l'**application Spotify** sur l'appareil branché aux enceintes (Premium), lancez un titre quelconque, **désactivez la lecture aléatoire**, puis cliquez sur **Lancer la playlist** dans l'admin (ou lancez la playlist depuis Spotify).
- Les nouveaux titres s'ajoutent à la fin. Réordonner, retirer ou interdire se fait depuis l'admin.
- **Faites un test complet la veille**, en particulier : ajout pendant la lecture, réorganisation pendant la lecture.

## Plan B (sans réseau)
- Préparez une grande playlist de secours et **téléchargez-la** dans Spotify (Premium) pour l'écouter hors ligne.
- La playlist des invités peut aussi être téléchargée en fin de repas.
- Sur la carte imprimée, ajoutez un lien Google Form de secours.

## Limites connues
- Spotify limite la recherche à 10 résultats par page : le site en lit deux, puis retire les titres explicites ou interdits.
- La limite par invité repose sur l'appareil (stockage du navigateur) : suffisant pour un mariage, contournable par un invité très motivé.
- La page admin doit rester ouverte pour que les titres déjà joués soient détectés (ils sont séparés des titres à venir).
