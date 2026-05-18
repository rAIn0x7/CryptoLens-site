import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Disable dead / low-signal sources
  const toDisable = [
    'Reddit Crypto', 'Reddit AI',       // low signal
    'Bankless',                          // 403
    'Bitcoin Magazine',                  // 403
    'Milk Road',                         // XML parse error
    'a16z crypto',                       // 404
    'Paradigm',                          // 404
    'Import AI',                         // 403
    'The Batch',                         // 404
  ];
  const { error: disableErr } = await supabase
    .from('sources')
    .update({ is_active: false })
    .in('name', toDisable);
  if (disableErr) console.error('Disable error:', disableErr.message);
  else console.log(`✓ Disabled ${toDisable.length} dead/low-signal sources`);

  // Replacement sources (all verified 200 OK)
  const newSources = [
    // Crypto replacements
    { name: 'Unchained',      url: 'https://unchainedcrypto.com',  feed_url: 'https://unchainedcrypto.com/feed/',                              category: 'crypto' },
    { name: 'BeInCrypto',     url: 'https://beincrypto.com',       feed_url: 'https://beincrypto.com/feed/',                                   category: 'crypto' },
    { name: 'DL News',        url: 'https://www.dlnews.com',       feed_url: 'https://www.dlnews.com/rss/',                                    category: 'crypto' },
    { name: 'Protos',         url: 'https://protos.com',           feed_url: 'https://protos.com/feed/',                                       category: 'crypto' },
    { name: 'CryptoNews',     url: 'https://cryptonews.com',       feed_url: 'https://cryptonews.com/news/feed/',                              category: 'crypto' },
    // AI replacements
    { name: 'VentureBeat AI', url: 'https://venturebeat.com',      feed_url: 'https://venturebeat.com/category/ai/feed/',                      category: 'ai'     },
    { name: 'TechCrunch AI',  url: 'https://techcrunch.com',       feed_url: 'https://techcrunch.com/category/artificial-intelligence/feed/',  category: 'ai'     },
  ];

  // Check which already exist
  const { data: existing } = await supabase.from('sources').select('name');
  const existingNames = new Set((existing || []).map(s => s.name));

  let added = 0;
  for (const src of newSources) {
    if (existingNames.has(src.name)) {
      console.log(`  skip (exists): ${src.name}`);
      continue;
    }
    const { error } = await supabase.from('sources').insert(src);
    if (error) console.error(`  insert failed: ${src.name}: ${error.message}`);
    else { console.log(`  added: ${src.name}`); added++; }
  }
  console.log(`✓ ${added} new sources added`);

  const { data: all } = await supabase
    .from('sources')
    .select('name, is_active')
    .order('name');
  console.log('\nAll sources:');
  all?.forEach(s => console.log(`  [${s.is_active ? '✓' : '✗'}] ${s.name}`));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
