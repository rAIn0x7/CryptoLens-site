import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Disable low-signal Reddit sources
  const { error: disableErr } = await supabase
    .from('sources')
    .update({ is_active: false })
    .in('name', ['Reddit Crypto', 'Reddit AI']);
  if (disableErr) console.error('Disable Reddit:', disableErr.message);
  else console.log('✓ Reddit sources disabled');

  // Add high-signal sources
  const newSources = [
    { name: 'CoinTelegraph',    url: 'https://cointelegraph.com',   feed_url: 'https://cointelegraph.com/rss',             category: 'crypto' },
    { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com', feed_url: 'https://bitcoinmagazine.com/.rss/full/',    category: 'crypto' },
    { name: 'The Defiant',      url: 'https://thedefiant.io',       feed_url: 'https://thedefiant.io/feed',               category: 'crypto' },
    { name: 'Bankless',         url: 'https://bankless.com',        feed_url: 'https://bankless.substack.com/feed',        category: 'crypto' },
    { name: 'CryptoSlate',      url: 'https://cryptoslate.com',     feed_url: 'https://cryptoslate.com/feed/',            category: 'crypto' },
    { name: 'Milk Road',        url: 'https://milkroad.com',        feed_url: 'https://milkroad.com/feed',                category: 'crypto' },
  ];

  const { error: insertErr } = await supabase
    .from('sources')
    .upsert(newSources, { onConflict: 'name', ignoreDuplicates: true });
  if (insertErr) console.error('Add sources:', insertErr.message);
  else console.log(`✓ ${newSources.length} new sources added`);

  const { data: active } = await supabase
    .from('sources')
    .select('name, is_active')
    .order('name');
  console.log('\nCurrent sources:');
  active?.forEach(s => console.log(`  [${s.is_active ? '✓' : '✗'}] ${s.name}`));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
