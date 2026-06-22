#!/usr/bin/env node
/**
 * import-kaggle.mjs
 *
 * Imports player data from the stefanoleone992 FIFA/EA FC dataset (Kaggle)
 * and generates the JSON files consumed by the Elite Cup app.
 *
 * USAGE:
 *   1. Download the dataset from Kaggle:
 *      https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset
 *   2. Place the CSV files in `raw/` folder at project root:
 *      raw/male_players.csv  (or individual files: players_15.csv ... players_24.csv)
 *   3. Run: node scripts/import-kaggle.mjs
 *
 * The script reads CSV files from `raw/`, filters players from Champions League
 * clubs, and outputs:
 *   - data/leagues.json
 *   - data/editions.json
 *   - data/clubs.json
 *   - data/club-editions.json
 *   - data/players.json
 *   - data/registrations.json
 *
 * OPTIONS (env vars):
 *   MIN_OVERALL=70    — minimum overall rating to include (default: 70)
 *   MAX_PLAYERS=25    — max players per club per edition (default: 25)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RAW_DIR = join(process.cwd(), 'raw');
const DATA_DIR = join(process.cwd(), 'data');
const MIN_OVERALL = parseInt(process.env.MIN_OVERALL || '70', 10);
const MAX_PLAYERS_PER_CLUB = parseInt(process.env.MAX_PLAYERS || '25', 10);

// FIFA version → season mapping
const VERSION_TO_SEASON = {
  15: '2014-15',
  16: '2015-16',
  17: '2016-17',
  18: '2017-18',
  19: '2018-19',
  20: '2019-20',
  21: '2020-21',
  22: '2021-22',
  23: '2022-23',
  24: '2023-24',
  25: '2024-25',
};

// Map FIFA positions → our 10 positions
const POSITION_MAP = {
  'GK': 'Goleiro',
  'CB': 'Zagueiro',
  'LB': 'Lateral_Esquerdo',
  'LWB': 'Lateral_Esquerdo',
  'RB': 'Lateral_Direito',
  'RWB': 'Lateral_Direito',
  'CDM': 'Volante',
  'CM': 'Meia_Central',
  'CAM': 'Meia_Ofensivo',
  'LM': 'Ponta_Esquerda',
  'LW': 'Ponta_Esquerda',
  'RM': 'Ponta_Direita',
  'RW': 'Ponta_Direita',
  'CF': 'Atacante',
  'ST': 'Atacante',
  'RF': 'Atacante',
  'LF': 'Atacante',
};

// Champions League clubs — only import players from these clubs.
// Add more club names (as they appear in FIFA data) to expand.
const CHAMPIONS_LEAGUE_CLUBS = new Set([
  // England
  'Manchester City', 'Manchester United', 'Liverpool', 'Chelsea', 'Arsenal',
  'Tottenham Hotspur', 'Newcastle United', 'Aston Villa',
  // Spain
  'Real Madrid CF', 'Real Madrid', 'FC Barcelona', 'Barcelona', 'Atlético Madrid',
  'Atlético de Madrid', 'Sevilla FC', 'Sevilla', 'Real Sociedad', 'Valencia CF',
  'Villarreal CF',
  // Germany
  'FC Bayern München', 'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig',
  'Bayer 04 Leverkusen', 'VfL Wolfsburg', 'Eintracht Frankfurt',
  // Italy
  'Juventus', 'Inter', 'Inter Milan', 'AC Milan', 'SSC Napoli', 'Napoli',
  'SS Lazio', 'Lazio', 'Atalanta', 'AS Roma',
  // France
  'Paris Saint-Germain', 'PSG', 'Olympique Lyonnais', 'AS Monaco',
  'Olympique de Marseille', 'LOSC Lille', 'RC Lens',
  // Portugal
  'SL Benfica', 'Benfica', 'FC Porto', 'Porto', 'Sporting CP', 'SC Braga',
  // Netherlands
  'Ajax', 'AFC Ajax', 'PSV', 'PSV Eindhoven', 'Feyenoord',
  // Others
  'Celtic', 'FC Salzburg', 'Red Bull Salzburg', 'FC København', 'FC Copenhagen',
  'Galatasaray SK', 'Galatasaray', 'Shakhtar Donetsk', 'FC Shakhtar Donetsk',
  'Dynamo Kyiv', 'FC Dynamo Kyiv', 'Red Star Belgrade', 'FK Crvena Zvezda',
  'Club Brugge KV', 'RSC Anderlecht', 'Young Boys', 'BSC Young Boys',
  'FC Basel', 'Malmö FF', 'FC Zürich', 'Rangers', 'FC Midtjylland',
  'Olympiacos CFP', 'PAOK', 'Viktoria Plzeň', 'Slavia Praha',
  'Ferencvárosi TC', 'Sheriff Tiraspol', 'FK Sheriff',
  'Royal Antwerp FC', 'Antwerp', 'Union Berlin', '1. FC Union Berlin',
  'RC Lens', 'Lens',
]);

// Normalize club name → our club ID
function normalizeClubId(clubName) {
  const name = clubName.trim();
  const MAP = {
    'Real Madrid CF': 'real-madrid', 'Real Madrid': 'real-madrid',
    'FC Barcelona': 'barcelona', 'Barcelona': 'barcelona',
    'Atlético Madrid': 'atletico-madrid', 'Atlético de Madrid': 'atletico-madrid',
    'Manchester City': 'manchester-city',
    'Manchester United': 'manchester-united',
    'Liverpool': 'liverpool',
    'Chelsea': 'chelsea',
    'Arsenal': 'arsenal',
    'Tottenham Hotspur': 'tottenham',
    'Newcastle United': 'newcastle-united',
    'Aston Villa': 'aston-villa',
    'FC Bayern München': 'bayern-munich', 'Bayern Munich': 'bayern-munich',
    'Borussia Dortmund': 'borussia-dortmund',
    'RB Leipzig': 'rb-leipzig',
    'Bayer 04 Leverkusen': 'bayer-leverkusen',
    'VfL Wolfsburg': 'wolfsburg',
    'Eintracht Frankfurt': 'eintracht-frankfurt',
    'Juventus': 'juventus',
    'Inter': 'inter-milan', 'Inter Milan': 'inter-milan',
    'AC Milan': 'ac-milan',
    'SSC Napoli': 'napoli', 'Napoli': 'napoli',
    'SS Lazio': 'lazio', 'Lazio': 'lazio',
    'Atalanta': 'atalanta',
    'AS Roma': 'as-roma',
    'Paris Saint-Germain': 'psg', 'PSG': 'psg',
    'Olympique Lyonnais': 'olympique-lyonnais',
    'AS Monaco': 'as-monaco',
    'Olympique de Marseille': 'marseille',
    'LOSC Lille': 'lille',
    'RC Lens': 'lens', 'Lens': 'lens',
    'SL Benfica': 'benfica', 'Benfica': 'benfica',
    'FC Porto': 'porto', 'Porto': 'porto',
    'Sporting CP': 'sporting-cp',
    'SC Braga': 'braga',
    'Ajax': 'ajax', 'AFC Ajax': 'ajax',
    'PSV': 'psv', 'PSV Eindhoven': 'psv',
    'Feyenoord': 'feyenoord',
    'Celtic': 'celtic',
    'FC Salzburg': 'salzburg', 'Red Bull Salzburg': 'salzburg',
    'FC København': 'fc-copenhagen', 'FC Copenhagen': 'fc-copenhagen',
    'Galatasaray SK': 'galatasaray', 'Galatasaray': 'galatasaray',
    'Shakhtar Donetsk': 'shakhtar-donetsk', 'FC Shakhtar Donetsk': 'shakhtar-donetsk',
    'Red Star Belgrade': 'red-star-belgrade', 'FK Crvena Zvezda': 'red-star-belgrade',
    'Club Brugge KV': 'club-brugge',
    'Young Boys': 'young-boys', 'BSC Young Boys': 'young-boys',
    'Royal Antwerp FC': 'antwerp', 'Antwerp': 'antwerp',
    'Union Berlin': 'union-berlin', '1. FC Union Berlin': 'union-berlin',
    'Rangers': 'rangers',
  };
  return MAP[name] || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function normalizeClubName(clubName) {
  // Use a cleaner display name
  const MAP = {
    'Real Madrid CF': 'Real Madrid',
    'FC Barcelona': 'Barcelona',
    'Atlético de Madrid': 'Atlético Madrid',
    'FC Bayern München': 'Bayern Munich',
    'SSC Napoli': 'Napoli',
    'SS Lazio': 'Lazio',
    'Paris Saint-Germain': 'PSG',
    'SL Benfica': 'Benfica',
    'FC Porto': 'Porto',
    'AFC Ajax': 'Ajax',
    'FC Salzburg': 'Red Bull Salzburg',
    'FC København': 'FC Copenhagen',
    'Galatasaray SK': 'Galatasaray',
    'FC Shakhtar Donetsk': 'Shakhtar Donetsk',
    'FK Crvena Zvezda': 'Red Star Belgrade',
    'BSC Young Boys': 'Young Boys',
    'Royal Antwerp FC': 'Royal Antwerp',
    '1. FC Union Berlin': 'Union Berlin',
    'Bayer 04 Leverkusen': 'Bayer Leverkusen',
  };
  return MAP[clubName] || clubName;
}

function normalizePlayerId(name) {
  return 'jogador:' + name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function mapPositions(fifaPositions) {
  if (!fifaPositions) return [];
  const positions = fifaPositions.split(',').map(p => p.trim());
  const mapped = new Set();
  for (const pos of positions) {
    const our = POSITION_MAP[pos];
    if (our) mapped.add(our);
  }
  return [...mapped];
}

// ---------------------------------------------------------------------------
// CSV Parser (simple, handles quoted fields)
// ---------------------------------------------------------------------------

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length !== headers.length) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j];
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!existsSync(RAW_DIR)) {
    mkdirSync(RAW_DIR, { recursive: true });
    console.log(`\n📁 Created raw/ directory.`);
    console.log(`\n📥 Download the dataset from Kaggle and place CSV files in raw/:`);
    console.log(`   https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset`);
    console.log(`\n   Expected files: male_players.csv OR players_15.csv, players_16.csv, etc.`);
    console.log(`\n   Then run this script again.\n`);
    process.exit(0);
  }

  // Find CSV files
  const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.csv'));
  if (files.length === 0) {
    console.log(`\n❌ No CSV files found in raw/`);
    console.log(`   Download from: https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset\n`);
    process.exit(1);
  }

  console.log(`\n🔍 Found ${files.length} CSV file(s) in raw/`);

  const allPlayers = new Map(); // playerId → { id, name }
  const allClubs = new Map();   // clubId → { id, name, country }
  const allEditions = [];       // { id, leagueId, season, label }
  const allClubEditions = [];   // { clubId, editionId, finalStage }
  const allRegistrations = [];  // { playerId, clubId, editionId, positions, rating }

  const seasonsProcessed = new Set();
  const clubEditionKeys = new Set();

  for (const file of files) {
    // Determine FIFA version from filename
    let version = null;
    const versionMatch = file.match(/(\d{2})/);
    if (versionMatch) {
      version = parseInt(versionMatch[1], 10);
    }

    // For the unified file (male_players.csv), we'll use the fifa_version column
    const isUnified = file.toLowerCase().includes('male_players');

    console.log(`📄 Processing ${file}${version ? ` (FIFA ${version})` : ''}...`);

    const content = readFileSync(join(RAW_DIR, file), 'utf8');
    const rows = parseCSV(content);
    console.log(`   ${rows.length} rows parsed`);

    // Determine which columns exist
    const sample = rows[0] || {};
    const hasVersion = 'fifa_version' in sample;
    const overallCol = 'overall' in sample ? 'overall' : 'Overall';
    const nameCol = 'short_name' in sample ? 'short_name' : ('Name' in sample ? 'Name' : 'short_name');
    const longNameCol = 'long_name' in sample ? 'long_name' : nameCol;
    const clubCol = 'club_name' in sample ? 'club_name' : ('Club' in sample ? 'Club' : 'club_name');
    const posCol = 'player_positions' in sample ? 'player_positions' : ('Position' in sample ? 'Position' : 'club_position');
    const nationCol = 'nationality_name' in sample ? 'nationality_name' : 'Nationality';

    let processedCount = 0;

    for (const row of rows) {
      // Determine version for this row
      let rowVersion = version;
      if (hasVersion && row.fifa_version) {
        rowVersion = parseInt(row.fifa_version, 10);
      }

      const season = VERSION_TO_SEASON[rowVersion];
      if (!season) continue;

      const clubName = row[clubCol];
      if (!clubName) continue;

      // Filter: only Champions League clubs
      if (!CHAMPIONS_LEAGUE_CLUBS.has(clubName)) continue;

      const overall = parseInt(row[overallCol], 10);
      if (isNaN(overall) || overall < MIN_OVERALL) continue;

      const playerName = row[longNameCol] || row[nameCol] || '';
      if (!playerName) continue;

      const positions = mapPositions(row[posCol]);
      if (positions.length === 0) continue;

      const clubId = 'clube:' + normalizeClubId(clubName);
      const playerId = normalizePlayerId(playerName);
      const editionId = `edicao:champions-league:${season}`;

      // Track season
      if (!seasonsProcessed.has(season)) {
        seasonsProcessed.add(season);
        allEditions.push({
          id: editionId,
          leagueId: 'liga:champions-league',
          season,
          label: `Champions League ${season}`,
        });
      }

      // Track club
      if (!allClubs.has(clubId)) {
        allClubs.set(clubId, {
          id: clubId,
          name: normalizeClubName(clubName),
          country: row[nationCol] ? '' : '', // We'll set country later if needed
        });
      }

      // Track club-edition
      const ceKey = `${clubId}|${editionId}`;
      if (!clubEditionKeys.has(ceKey)) {
        clubEditionKeys.add(ceKey);
        allClubEditions.push({
          clubId,
          editionId,
          finalStage: 'GroupStage', // Default; can be updated manually
        });
      }

      // Track player
      if (!allPlayers.has(playerId)) {
        allPlayers.set(playerId, { id: playerId, name: playerName });
      }

      // Track registration (limit per club per edition)
      const regCountKey = `${clubId}|${editionId}`;
      const currentCount = allRegistrations.filter(
        r => r.clubId === clubId && r.editionId === editionId
      ).length;
      if (currentCount >= MAX_PLAYERS_PER_CLUB) continue;

      // Avoid duplicate registration
      const regKey = `${playerId}|${clubId}|${editionId}`;
      const exists = allRegistrations.some(
        r => r.playerId === playerId && r.clubId === clubId && r.editionId === editionId
      );
      if (exists) continue;

      allRegistrations.push({
        playerId,
        clubId,
        editionId,
        positions,
        rating: overall,
      });

      processedCount++;
    }

    console.log(`   ✓ ${processedCount} player registrations extracted`);
  }

  // Sort editions by season
  allEditions.sort((a, b) => a.season.localeCompare(b.season));

  // Output
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const leagues = [{ id: 'liga:champions-league', name: 'UEFA Champions League' }];

  writeJSON('leagues.json', leagues);
  writeJSON('editions.json', allEditions);
  writeJSON('clubs.json', [...allClubs.values()]);
  writeJSON('club-editions.json', allClubEditions);
  writeJSON('players.json', [...allPlayers.values()]);
  writeJSON('registrations.json', allRegistrations);

  console.log(`\n✅ Import complete!`);
  console.log(`   📊 ${allEditions.length} editions`);
  console.log(`   🏟️  ${allClubs.size} clubs`);
  console.log(`   👤 ${allPlayers.size} players`);
  console.log(`   📋 ${allRegistrations.length} registrations`);
  console.log(`   📁 Files written to data/\n`);
}

function writeJSON(filename, data) {
  const path = join(DATA_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`   💾 ${filename} (${data.length} entries)`);
}

main();
