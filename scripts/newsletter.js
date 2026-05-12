import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const TODAY = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const DAY = new Date().getDay();

async function getTopArticles(hoursBack) {
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString();
  const { data } = await supabase
    .from('articles')
    .select('*, sources(name)')
    .gte('published_at', since)
    .gte('importance_score', 8)
    .order('importance_score', { ascending: false })
    .limit(10);
  return data || [];
}

function scoreColor(score) {
  if (score >= 9) return '#00d4ff';
  if (score >= 8) return '#e8eaf0';
  return '#6b7280';
}

function articleBlock(article, includePro) {
  const note = includePro && article.editor_note
    ? `<p style="border-left:2px solid #00d4ff;padding-left:12px;color:#9ca3af;font-size:13px;line-height:1.6;margin:8px 0 0">${article.editor_note}</p>`
    : includePro
    ? `<p style="border-left:2px solid #6b7280;padding-left:12px;color:#6b7280;font-size:12px;font-style:italic">No editor note yet.</p>`
    : '';

  return `
    <div style="border:1px solid rgba(0,212,255,0.15);border-radius:6px;padding:16px;margin-bottom:12px;background:#0f1524">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-family:monospace;font-size:11px;color:#6b7280">${article.sources?.name || ''} · ${new Date(article.published_at).toLocaleDateString()}</span>
        <span style="font-family:monospace;font-size:13px;font-weight:700;color:${scoreColor(article.importance_score)}">●${article.importance_score}</span>
      </div>
      <a href="https://lens.qizh.space/article.html?id=${article.id}" style="color:#e8eaf0;font-size:15px;font-weight:600;text-decoration:none;line-height:1.3;display:block;margin-bottom:8px">${article.title}</a>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">${article.summary || ''}</p>
      ${note}
    </div>`;
}

function buildEmail(articles, isPro, isWeekly) {
  const subject = isWeekly
    ? `CryptoLens Weekly | ${TODAY} — Top ${articles.length}`
    : `CryptoLens Daily | ${TODAY} — Top ${Math.min(5, articles.length)}`;

  const sliced = isWeekly ? articles : articles.slice(0, 5);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="background:#0a0e1a;color:#e8eaf0;font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="margin-bottom:24px">
      <span style="font-family:monospace;font-size:18px;font-weight:700;color:#00d4ff">CRYPTOLENS</span>
      <span style="font-family:monospace;font-size:12px;color:#6b7280;margin-left:12px">${TODAY}${isPro ? ' · PRO' : ''}</span>
    </div>

    <p style="font-family:monospace;font-size:11px;color:#6b7280;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:16px">
      ${isWeekly ? "This Week's Top Signal" : "Today's Top Signal"}
    </p>

    ${sliced.map(a => articleBlock(a, isPro)).join('')}

    <div style="border:1px solid rgba(0,212,255,0.12);border-radius:6px;padding:16px;margin:24px 0;text-align:center">
      <p style="font-family:monospace;font-size:10px;color:#6b7280;text-transform:uppercase;margin:0 0 8px">Partner</p>
      <p style="font-size:13px;color:#9ca3af;margin:0">Trade on <a href="https://accounts.binance.com/register?ref=YOUR_REF" style="color:#00d4ff">Binance</a> — earn rebates on every trade. ${isPro ? '' : '<a href="https://lens.qizh.space/subscribe.html" style="color:#7c3aed">Upgrade to Pro</a> for daily delivery + Editor\'s Take.'}</p>
    </div>

    <div style="border-top:1px solid rgba(0,212,255,0.1);padding-top:16px;font-size:11px;color:#6b7280;line-height:1.6">
      <p>CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research. Cryptocurrency investments carry significant risk.</p>
      <p style="margin-top:8px"><a href="https://lens.qizh.space" style="color:#6b7280">Visit CryptoLens</a> · <a href="https://lens.qizh.space/subscribe.html" style="color:#6b7280">Manage subscription</a></p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

async function getSubscribers(isPro) {
  const { data } = await supabase
    .from('subscribers')
    .select('email')
    .eq('is_active', true)
    .eq('is_pro', isPro);
  return (data || []).map(s => s.email);
}

async function sendBatch(emails, subject, html, tag) {
  if (!emails.length) { console.log(`  No ${tag} subscribers`); return; }

  const chunks = [];
  for (let i = 0; i < emails.length; i += 50) chunks.push(emails.slice(i, i + 50));

  for (const chunk of chunks) {
    const { error } = await resend.emails.send({
      from: 'CryptoLens <signal@lens.qizh.space>',
      to: chunk,
      subject,
      html
    });
    if (error) console.error(`  Send error (${tag}):`, error);
    else console.log(`  Sent to ${chunk.length} ${tag} subscribers`);
  }
}

async function main() {
  console.log('CryptoLens newsletter:', new Date().toISOString());

  const isWeekly = DAY === 1;
  const articles = await getTopArticles(isWeekly ? 168 : 24);
  console.log(`Found ${articles.length} articles`);

  if (!articles.length) { console.log('No articles to send.'); return; }

  const freeEmails = await getSubscribers(false);
  const { subject: freeSubject, html: freeHtml } = buildEmail(articles, false, isWeekly);
  await sendBatch(freeEmails, freeSubject, freeHtml, 'free');

  const proEmails = await getSubscribers(true);
  const { subject: proSubject, html: proHtml } = buildEmail(articles, true, isWeekly);
  await sendBatch(proEmails, proSubject, proHtml, 'pro');

  console.log('Done.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
