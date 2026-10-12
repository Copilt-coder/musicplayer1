// Usage : node scripts/make-qr.js https://votre-site.vercel.app
import QRCode from 'qrcode';

const url = process.argv[2];
if (!url) { console.error('Donnez l’adresse du site : node scripts/make-qr.js https://...'); process.exit(1); }
const opts = { margin: 2, errorCorrectionLevel: 'H', color: { dark: '#1b3a2f', light: '#ffffff' } };
await QRCode.toFile('qr-mariage.png', url, { ...opts, width: 1400 });
await QRCode.toFile('qr-mariage.svg', url, { ...opts, type: 'svg' });
console.log('Créés : qr-mariage.png (impression) et qr-mariage.svg (vectoriel)');
