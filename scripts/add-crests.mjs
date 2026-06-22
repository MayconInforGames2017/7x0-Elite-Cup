#!/usr/bin/env node
/**
 * add-crests.mjs
 *
 * Adds crest URLs from football-data.org to clubs.json.
 * The crests are SVG files served from https://crests.football-data.org/{id}.svg
 *
 * Usage: node scripts/add-crests.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');

// Mapping: our club ID slug → football-data.org team ID
// Source: https://docs.football-data.org/general/v4/team.html
const CREST_IDS = {
  'real-madrid': 86,
  'barcelona': 81,
  'manchester-city': 65,
  'manchester-united': 66,
  'liverpool': 64,
  'chelsea': 61,
  'arsenal': 57,
  'tottenham': 73,
  'newcastle-united': 67,
  'aston-villa': 58,
  'bayern-munich': 5,
  'borussia-dortmund': 4,
  'rb-leipzig': 721,
  'bayer-leverkusen': 3,
  'wolfsburg': 11,
  'eintracht-frankfurt': 19,
  'juventus': 109,
  'inter-milan': 108,
  'ac-milan': 98,
  'napoli': 113,
  'lazio': 110,
  'atalanta': 102,
  'as-roma': 100,
  'psg': 524,
  'olympique-lyonnais': 523,
  'as-monaco': 548,
  'marseille': 516,
  'lille': 521,
  'lens': 546,
  'benfica': 1903,
  'porto': 503,
  'sporting-cp': 498,
  'braga': 5601,
  'ajax': 678,
  'psv': 674,
  'feyenoord': 675,
  'celtic': 732,
  'rangers': 738,
  'salzburg': 1877,
  'fc-copenhagen': 1880,
  'galatasaray': 610,
  'shakhtar-donetsk': 1887,
  'red-star-belgrade': 7283,
  'club-brugge': 851,
  'young-boys': 1871,
  'antwerp': 1864,
  'union-berlin': 28,
  'atletico-madrid': 78,
  'sevilla': 559,
  'real-sociedad': 92,
};

function main() {
  const clubsPath = join(DATA_DIR, 'clubs.json');
  const clubs = JSON.parse(readFileSync(clubsPath, 'utf8'));

  let updated = 0;
  for (const club of clubs) {
    // Extract slug from id (remove 'clube:' prefix)
    const slug = club.id.replace('clube:', '');
    const crestId = CREST_IDS[slug];

    if (crestId) {
      club.crest = `https://crests.football-data.org/${crestId}.svg`;
      updated++;
    } else {
      // No crest available — leave empty
      if (!club.crest) club.crest = null;
    }
  }

  writeFileSync(clubsPath, JSON.stringify(clubs, null, 2));
  console.log(`✅ Updated ${updated}/${clubs.length} clubs with crest URLs`);
}

main();
