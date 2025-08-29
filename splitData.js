const fs = require('fs');

// Mapping from data keys to filenames
const mapping = {
  Bestellung: 'Bestellung.json',
  Bewegung: 'Bewegung.json',
  Buchungen: 'Buchungen.json',
  Konto: 'Konto.json',
  Lager: 'Lager.json'
};

function splitData() {
  let raw;
  try {
    raw = fs.readFileSync('data.json', 'utf8');
  } catch (err) {
    console.error('Could not read data.json:', err.message);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error('Invalid JSON in data.json:', err.message);
    process.exit(1);
  }

  for (const [key, filename] of Object.entries(mapping)) {
    const content = key in data ? data[key] : {};
    try {
      fs.writeFileSync(filename, JSON.stringify(content, null, 2));
      console.log(`Wrote ${filename}`);
    } catch (err) {
      console.error(`Failed to write ${filename}:`, err.message);
    }
  }
}

splitData();