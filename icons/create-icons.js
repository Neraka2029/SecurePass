// Script pour créer les icônes de l'extension
// Ce fichier peut être exécuté avec Node.js pour générer les icônes SVG

const fs = require('fs');
const path = require('path');

// Template SVG pour l'icône SecurePass
const iconSVG = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background circle -->
  <circle cx="64" cy="64" r="60" fill="url(#grad1)" stroke="white" stroke-width="4"/>
  
  <!-- Shield shape -->
  <path d="M64,12 L24,28 L24,48 C24,76 40,100.5 64,108 C88,100.5 104,76 104,48 L104,28 L64,12 Z" 
        fill="white" opacity="0.9"/>
  
  <!-- Lock -->
  <path d="M64,40 C70,40 76,44.5 76,50 L76,56 C79,56 82,59 82,62 L82,78 C82,81 79,84 76,84 L52,84 C49,84 46,81 46,78 L46,62 C46,59 49,56 52,56 L52,50 C52,44.5 58,40 64,40 Z M64,44 C60,44 56,46.5 56,50 L56,56 L72,56 L72,50 C72,46.5 68,44 64,44 Z" 
        fill="url(#grad1)"/>
  
  <!-- Key hole -->
  <circle cx="64" cy="68" r="4" fill="white"/>
  <rect x="62" y="68" width="4" height="8" fill="white"/>
</svg>
`;

// Fonction pour créer une icône PNG à partir du SVG (simulée)
function createIconFile(size, filename) {
  // Pour une vraie implémentation, vous utiliseriez une bibliothèque comme 'sharp' ou 'canvas'
  // Ici, nous créons juste le fichier SVG redimensionné
  const scaledSVG = iconSVG.replace('width="128" height="128"', `width="${size}" height="${size}"`);
  
  const svgFilename = filename.replace('.png', '.svg');
  fs.writeFileSync(path.join(__dirname, svgFilename), scaledSVG);
  
  console.log(`Icône créée: ${svgFilename} (${size}x${size})`);
}

// Créer le dossier icons s'il n'existe pas
if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

// Créer les différentes tailles d'icônes
createIconFile(16, 'icon16.png');
createIconFile(32, 'icon32.png');
createIconFile(48, 'icon48.png');
createIconFile(128, 'icon128.png');

console.log('Icônes créées avec succès !');
console.log('Note: Pour une extension de production, convertissez les fichiers SVG en PNG avec un outil approprié.');