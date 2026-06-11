import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { console.log('  ✗', m); failures++; };
let failures = 0;
const q = (s, ...v) => prisma.$queryRawUnsafe(s, ...v);

async function main() {
  console.log('\n=== 1. CONNECTIVITY ===');
  await prisma.$queryRaw`SELECT 1`;
  ok('Connected to Postgres');

  console.log('\n=== 2. EXTENSIONS ===');
  const ext = await prisma.$queryRaw`SELECT extname FROM pg_extension WHERE extname IN ('vector','uuid-ossp')`;
  const names = ext.map(e => e.extname);
  names.includes('vector') ? ok('vector') : bad('vector MISSING');
  names.includes('uuid-ossp') ? ok('uuid-ossp') : bad('uuid-ossp MISSING');

  console.log('\n=== 3. TABLES ===');
  const expected = ['cards','benefits','transfer_partners','tnc_versions','users','user_cards',
    'points_ledger','preferences','redemption_history','recommendation_events','benefit_embeddings','scraper_runs'];
  const rows = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  const present = rows.map(r => r.tablename);
  for (const t of expected) present.includes(t) ? ok(t) : bad(`${t} MISSING`);

  console.log('\n=== 4. SEED ROW COUNTS (raw SQL) ===');
  const cnt = async (t) => Number((await q(`SELECT COUNT(*)::int AS n FROM ${t}`))[0].n);
  const checks = { cards:3, benefits:null, transfer_partners:null, tnc_versions:3, users:2, user_cards:3, points_ledger:null, preferences:2, recommendation_events:3 };
  for (const [t,exp] of Object.entries(checks)) {
    const n = await cnt(t);
    if (exp===null) console.log(`    ${t} = ${n}`);
    else (n===exp ? ok(`${t} = ${n}`) : bad(`${t} = ${n}, expected ${exp}`));
  }

  console.log('\n=== 5. DEMO DATA — RIYA (raw SQL, snake_case) ===');
  const riya = await q(`SELECT uc.card_id, uc.current_points, uc.next_expiry_date FROM user_cards uc
    JOIN users u ON u.id=uc.user_id WHERE u.id='00000000-0000-0000-0000-000000000002' ORDER BY uc.card_id`);
  if (!riya.length) bad('Riya cards not found');
  for (const c of riya) {
    const d = c.next_expiry_date ? c.next_expiry_date.toISOString().slice(0,10) : 'null';
    console.log(`    ${c.card_id}: ${c.current_points} pts, next_expiry ${d}`);
  }
  const reg = riya.find(c=>c.card_id==='hdfc_regalia_gold');
  const mil = riya.find(c=>c.card_id==='hdfc_millennia');
  reg && reg.current_points===46500 ? ok('Regalia = 46,500 pts') : bad('Regalia points wrong/missing');
  mil && mil.current_points===3200 ? ok('Millennia = 3,200 pts') : bad('Millennia points wrong/missing');

  console.log('\n=== 6. DEMO DATE CHECK (today 2026-06-11) ===');
  const today = new Date('2026-06-11');
  for (const c of riya) {
    if (!c.next_expiry_date) continue;
    const days = Math.round((c.next_expiry_date - today)/86400000);
    console.log(`    ${c.card_id}: ${c.next_expiry_date.toISOString().slice(0,10)} (${days}d from today)`);
  }
  console.log('    Spec wants: Regalia Jun 13 (+2d), Millennia Jun 11 (0d, TODAY).');

  console.log('\n=== 7. FK INTEGRITY ===');
  const orphan = Number((await q(`SELECT COUNT(*)::int AS n FROM user_cards uc LEFT JOIN cards c ON uc.card_id=c.id WHERE c.id IS NULL`))[0].n);
  orphan===0 ? ok('No orphaned user_cards') : bad(`${orphan} orphaned user_cards`);
  const benEmb = Number((await q(`SELECT COUNT(*)::int AS n FROM benefits WHERE is_embedded=false`))[0].n);
  console.log(`    benefits awaiting embedding (is_embedded=false) = ${benEmb} → Phase 3 input`);
  const embRows = Number((await q(`SELECT COUNT(*)::int AS n FROM benefit_embeddings`))[0].n);
  console.log(`    benefit_embeddings rows = ${embRows} (expected 0 until Phase 3 runs)`);

  console.log('\n=====================================');
  console.log(failures===0 ? '✅ DB LAYER VERIFIED — all checks passed' : `❌ ${failures} check(s) FAILED`);
  console.log('=====================================\n');
}
main().catch(e=>{console.error('\nFATAL:',e.message);process.exit(1);}).finally(()=>prisma.$disconnect());
