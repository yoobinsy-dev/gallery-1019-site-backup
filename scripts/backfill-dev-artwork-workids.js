const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');

const backfill = require('../artworks/backfill');
const exhibitionIndex = require('../artworks/exhibition-index');
const { DEVELOPMENT_IDENTITIES, assertMutableTestTarget } = require('../tests/helpers/test-safety');

const BASE_URL = 'https://gallery-1019-site-dev.vercel.app';
const PROJECT_ID = 'calm-glitter-93873921';

function resolveDevDatabaseUrl() {
  return execFileSync('npx', [
    'neonctl', 'connection-string', DEVELOPMENT_IDENTITIES.databaseBranchId,
    '--project-id', PROJECT_ID,
    '--role-name', DEVELOPMENT_IDENTITIES.databaseRole,
    '--database-name', 'neondb',
    '--pooled',
    '--ssl', 'verify-full'
  ], { encoding: 'utf8' }).trim();
}

function verifyDevTarget(databaseUrl) {
  const project = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.vercel', 'project.json'), 'utf8'));
  const database = new URL(databaseUrl);
  assertMutableTestTarget({
    ...DEVELOPMENT_IDENTITIES,
    baseUrl: BASE_URL,
    vercelProjectId: project.projectId,
    databaseEndpointId: database.hostname.split('-pooler.')[0],
    databaseRole: decodeURIComponent(database.username),
    archiveWriteEnabled: false
  });
}

function occurrenceValues(exhibitions, field) {
  return exhibitions.flatMap((exhibition) => ['works', 'artWorks'].flatMap((collection) => (
    Array.isArray(exhibition?.[collection])
      ? exhibition[collection].map((work) => work?.[field])
      : []
  )));
}

function assertOnlyWorkIdsAdded(before, after) {
  before.forEach((exhibition, exhibitionIndex) => {
    const originalExhibitionFields = { ...exhibition };
    const nextExhibitionFields = { ...after[exhibitionIndex] };
    delete originalExhibitionFields.works;
    delete originalExhibitionFields.artWorks;
    delete nextExhibitionFields.works;
    delete nextExhibitionFields.artWorks;
    if (JSON.stringify(originalExhibitionFields) !== JSON.stringify(nextExhibitionFields)) {
      throw new Error(`Exhibition compatibility field preservation failed at exhibition ${exhibition.id}.`);
    }
    ['works', 'artWorks'].forEach((collection) => {
      if (!Array.isArray(exhibition?.[collection])) return;
      exhibition[collection].forEach((work, workIndex) => {
        const next = after[exhibitionIndex]?.[collection]?.[workIndex];
        const originalFields = { ...work };
        const nextFields = { ...next };
        delete originalFields.workId;
        delete nextFields.workId;
        if (JSON.stringify(originalFields) !== JSON.stringify(nextFields)) {
          throw new Error(`Legacy field preservation failed at exhibition ${exhibition.id}, ${collection}[${workIndex}].`);
        }
      });
    });
  });
}

function verifyState(artworks, exhibitions) {
  const index = exhibitionIndex.buildExhibitionIndex(exhibitions, artworks);
  const occurrences = exhibitions.flatMap((exhibition) => exhibitionIndex.getExhibitionWorks(exhibition).map((work) => ({ exhibition, work })));
  const linked = occurrences.filter(({ work }) => work.workId);
  const linkedWorkIds = new Set(linked.map(({ work }) => work.workId));
  const historyOccurrences = index.rows.reduce((sum, row) => sum + row.occurrences.length, 0);
  const latestValid = index.rows.every((row) => {
    const latest = row.occurrences.slice().sort(exhibitionIndex.compareOccurrences).at(-1);
    return String(row.latestExhibitionId) === String(latest.exhibition.id)
      && String(row.latestOccurrenceId) === String(latest.work.id)
      && row.latestPrice === (latest.work.price ?? '');
  });
  const collection = artworks.filter((artwork) => artwork.collection?.owned === true);
  const collectionOnly = collection.filter((artwork) => !linkedWorkIds.has(artwork.workId));
  return {
    totalOccurrences: occurrences.length,
    linkedOccurrences: linked.length,
    unresolvedOccurrences: index.unresolved.length,
    exhibitedCanonicalRows: index.rows.length,
    uniqueLinkedWorkIds: linkedWorkIds.size,
    deduplicated: index.rows.length === linkedWorkIds.size,
    completeHistory: historyOccurrences === linked.length,
    latestExhibitionAndPriceValid: latestValid,
    collectionWorks: collection.length,
    collectionOnlyWorks: collectionOnly.length,
    representativeRepeatedWork: index.rows
      .filter((row) => row.occurrences.length > 1)
      .sort((left, right) => right.occurrences.length - left.occurrences.length)
      .map((row) => ({
        workId: row.workId,
        title: row.title,
        appearances: row.occurrences.length,
        latestExhibitionId: row.latestExhibitionId,
        latestOccurrenceId: row.latestOccurrenceId,
        latestExhibition: row.latestExhibitionName,
        latestPrice: row.latestPrice
      }))[0] || null
  };
}

function report(mode, analysis, result = null) {
  return {
    ok: true,
    mode,
    target: BASE_URL,
    summary: analysis.summary,
    applyResult: result,
    ambiguous: analysis.classifications
      .filter((item) => item.classification === 'AMBIGUOUS')
      .map((item) => ({
        exhibitionId: item.exhibition.id,
        exhibition: item.exhibition.title || item.exhibition.name || '',
        occurrenceId: item.work.id,
        artist: item.work.author || item.work.artistName || '',
        title: item.work.title || '',
        year: item.work.year || '',
        size: item.work.size || '',
        reason: item.reason,
        candidates: item.candidates.map((candidate) => ({
          workId: candidate.workId,
          artist: candidate.artistName || '',
          title: candidate.title || '',
          year: candidate.year || '',
          size: candidate.size || ''
        }))
      }))
  };
}

async function run(mode = 'dry-run', options = {}) {
  if (!['dry-run', 'apply', 'verify'].includes(mode)) throw new Error('Usage: node scripts/backfill-dev-artwork-workids.js <dry-run|apply|verify>');
  const databaseUrl = options.databaseUrl || resolveDevDatabaseUrl();
  verifyDevTarget(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (mode === 'apply') await client.query('BEGIN');
    const rows = await client.query(
      `SELECT state_key, state_value FROM app_state WHERE state_key = ANY($1::text[])${mode === 'apply' ? ' FOR UPDATE' : ''}`,
      [['exhibitions', 'gallery-artworks-v1']]
    );
    const state = Object.fromEntries(rows.rows.map((row) => [row.state_key, row.state_value]));
    const artworks = Array.isArray(state['gallery-artworks-v1']) ? state['gallery-artworks-v1'] : [];
    const exhibitions = Array.isArray(state.exhibitions) ? state.exhibitions : [];
    const analysis = backfill.analyzeBackfill({ artworks, exhibitions });
    if (mode === 'dry-run') return report(mode, analysis);
    if (mode === 'verify') return { ...report(mode, analysis), verification: verifyState(artworks, exhibitions) };

    const applied = backfill.applyBackfill({ artworks, exhibitions, randomUUID });
    assertOnlyWorkIdsAdded(exhibitions, applied.exhibitions);
    if (JSON.stringify(occurrenceValues(exhibitions, 'price')) !== JSON.stringify(occurrenceValues(applied.exhibitions, 'price'))) {
      throw new Error('Historical price preservation failed.');
    }
    if (new Set(applied.artworks.map((artwork) => artwork.workId)).size !== applied.artworks.length) {
      throw new Error('Duplicate canonical workId detected.');
    }

    if (applied.result.occurrencesLinked > 0) {
      await client.query('UPDATE app_state SET state_value = $2::jsonb, updated_at = NOW() WHERE state_key = $1', ['gallery-artworks-v1', JSON.stringify(applied.artworks)]);
      await client.query('UPDATE app_state SET state_value = $2::jsonb, updated_at = NOW() WHERE state_key = $1', ['exhibitions', JSON.stringify(applied.exhibitions)]);
    }
    const verification = backfill.analyzeBackfill(applied);
    if (verification.summary.occurrencesToLink !== 0 || verification.summary.canonicalArtworksToCreate !== 0) {
      throw new Error('Backfill idempotence verification failed.');
    }
    await client.query('COMMIT');
    return report(mode, analysis, { ...applied.result, postApply: verification.summary });
  } catch (error) {
    if (mode === 'apply') await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  run(process.argv[2] || 'dry-run').then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { BASE_URL, assertOnlyWorkIdsAdded, report, run, verifyState };
