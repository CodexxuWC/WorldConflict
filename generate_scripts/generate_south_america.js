// generate_south_america.js
// Usage:
//   node generate_south_america.js            -> crée fichiers si absents (ne pas écraser)
//   node generate_south_america.js --force    -> écrase les fichiers existants
//
// Place ce fichier à la racine du projet (~/WorldConflict) et exécute-le avec node.

const fs = require('fs');
const path = require('path');

const FORCE = process.argv.includes('--force');

function slugify(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlever accents
    .toLowerCase()
    .replace(/['’"]/g, '') // virer apostrophes/marques
    .replace(/[^a-z0-9\s-]/g, '') // garder alnum espace -
    .trim()
    .replace(/\s+/g, '-');
}

// Liste complète Amérique du Sud
// id = identifiant court (3 lettres ou custom), name = nom affiché
const SOUTH_AMERICA = [
  { id: 'arg', name: 'Argentina' },
  { id: 'bol', name: 'Bolivia' },
  { id: 'bra', name: 'Brazil' },
  { id: 'chl', name: 'Chile' },
  { id: 'col', name: 'Colombia' },
  { id: 'ecu', name: 'Ecuador' },
  { id: 'guy', name: 'Guyana' },
  { id: 'pry', name: 'Paraguay' },
  { id: 'per', name: 'Peru' },
  { id: 'sur', name: 'Suriname' },
  { id: 'ury', name: 'Uruguay' },
  { id: 'ven', name: 'Venezuela' }
];

const outDir = path.join(process.cwd(), 'map', 'world', 'south_america');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

let created = 0, skipped = 0, overwritten = 0;

SOUTH_AMERICA.forEach(c => {
  const slug = slugify(c.name);
  const fileName = `${slug}.json`;
  const filePath = path.join(outDir, fileName);

  const payload = {
    id: (c.id || slug).toLowerCase(),
    name: c.name,
    continent: 'south_america',
    metadata: {
      created_at: today,
      updated_at: null
    },
    government: {
      leader: null,
      ministers: [],
      system: null
    },
    population: {
      value: 0,
      growth_rate: 0
    },
    economy: {
      gdp: 0,
      resources: {}
    },
    military: {
      active: 0,
      reserve: 0,
      equipment: {}
    },
    geography: {
      area_km2: 0,
      major_cities: [],
      climate_zones: [],
      borders: []
    },
    status: {
      occupied: false,
      contested: false
    }
  };

  if (fs.existsSync(filePath)) {
    if (FORCE) {
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      overwritten++;
      console.log(`overwritten: ${fileName}`);
    } else {
      skipped++;
      console.log(`skipped: ${fileName} (exists)`);
    }
  } else {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    created++;
    console.log(`created: ${fileName}`);
  }
});

console.log('\nSummary:');
console.log(`  created: ${created}`);
console.log(`  overwritten: ${overwritten}`);
console.log(`  skipped: ${skipped}`);
console.log(`Files generated in: ${outDir}`);
