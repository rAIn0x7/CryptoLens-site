// scripts/digest-startup.js
// Zion·降噪/创业信号 —— 一页纸周报
// 拉 startup_articles 近 7 天 Top 8~10 + 最新 startup_pulses,渲染成一页纸邮件,发给全部订阅者。
// 复用 newsletter.js 已验证的 Resend 发件人 / batch 发送 / subscribers 读取方式。
// 运行:node scripts/digest-startup.js  (需 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY)

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/* 全局看门狗:Gemini 已单独限时,但 Supabase 调用、DNS、socket 都可能 hang,
   而 job 一挂死就会被 timeout-minutes 杀掉 → 每次给 Zion 发一封 cancelled 通知邮件。
   到点主动、干净地收工:已经写进库的数据不受影响,没抓完的下一轮继续。 */
const HARD_LIMIT_MS = 5 * 60 * 1000;
setTimeout(() => {
  console.log(`\n⏱  到硬时限 5 分钟,主动收工(已入库的数据不受影响,余下的下一轮再抓)`);
  process.exit(0);
}, HARD_LIMIT_MS).unref();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

// 沿用 newsletter.js 里已验证的发件人(换域名会发不出)
const FROM = 'QiZh Lens <signal@lens.qizh.space>';
const STARTUP_URL = 'https://lens.qizh.space/startup/';
const MANAGE_URL = 'https://lens.qizh.space/startup/subscribe.html';

const TODAY = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

const CATEGORY_ZH = {
  startup: '创业', indie: '独立开发', overseas: '出海',
  ai: 'AI', funding: '融资', tools: '工具'
};

// ── 取数 ──────────────────────────────────────────────

// 近 7 天、按 importance_score 排序的 Top 8~10
async function getTopArticles(limit = 10) {
  const since = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
  const { data, error } = await supabase
    .from('startup_articles')
    .select('title, summary, summary_zh, source_name, original_url, category, importance_score, tags, published_at')
    .gte('published_at', since)
    .order('importance_score', { ascending: false })
    .limit(limit);
  if (error) { console.error('getTopArticles error:', error); return []; }

  // 兜底:近 7 天不足时,退回全库 Top 10(保证周报不空)
  if (!data || data.length < 3) {
    console.log(`  近 7 天仅 ${data ? data.length : 0} 条,退回全库 Top ${limit}`);
    const { data: all, error: e2 } = await supabase
      .from('startup_articles')
      .select('title, summary, summary_zh, source_name, original_url, category, importance_score, tags, published_at')
      .order('importance_score', { ascending: false })
      .limit(limit);
    if (e2) { console.error('getTopArticles fallback error:', e2); return data || []; }
    return all || [];
  }
  return data;
}

// 最新一条脉搏
async function getLatestPulse() {
  const { data, error } = await supabase
    .from('startup_pulses')
    .select('sentiment, sentiment_score, article_count, summary_en, key_themes')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) { console.error('getLatestPulse error:', error); return null; }
  return (data && data[0]) || null;
}

// subscribers 表无 segment/lang 字段,全发(仅 is_active 过滤)
async function getSubscribers() {
  const { data, error } = await supabase
    .from('subscribers')
    .select('email')
    .eq('is_active', true);
  if (error) { console.error('getSubscribers error:', error); return []; }
  return (data || []).map(s => s.email).filter(Boolean);
}

// ── 渲染 ──────────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreColor(score) {
  const n = Number(score) || 0;
  if (n >= 9) return '#00d4ff';
  if (n >= 8) return '#5b8def';
  return '#8a94a6';
}

function articleRow(a, idx) {
  const url = esc(a.original_url || STARTUP_URL);
  const cat = CATEGORY_ZH[a.category] || esc(a.category || '创业');
  const summary = esc(a.summary_zh || a.summary || '');
  const score = a.importance_score ?? 7;
  const src = esc(a.source_name || 'source');
  return `
  <tr>
    <td style="padding:14px 0;border-bottom:1px solid #e6e8ee;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;">
            <span style="font-family:'Courier New',monospace;font-size:12px;color:#8a94a6;">${cat} · ${src}</span>
          </td>
          <td style="vertical-align:top;text-align:right;white-space:nowrap;">
            <span style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:${scoreColor(score)};">●${esc(score)}</span>
          </td>
        </tr>
      </table>
      <a href="${url}" target="_blank" rel="noopener"
         style="display:block;margin:6px 0 4px;color:#111827;font-size:16px;line-height:1.4;font-weight:600;text-decoration:none;">
        ${idx}. ${esc(a.title)}
      </a>
      <p style="margin:0;color:#4b5563;font-size:14px;line-height:1.65;">${summary}</p>
    </td>
  </tr>`;
}

function buildEmail(articles, pulse) {
  const subject = `Zion 降噪 · 创业信号周报 | ${TODAY} — Top ${articles.length}`;

  const themes = pulse && pulse.key_themes && pulse.key_themes.length
    ? pulse.key_themes.map(t => `<span style="display:inline-block;background:#eef2ff;color:#4338ca;font-size:12px;border-radius:4px;padding:3px 9px;margin:3px 4px 0 0;">${esc(t)}</span>`).join('')
    : '';

  const pulseText = pulse && pulse.summary_en
    ? esc(pulse.summary_en)
    : '本周创业 / 独立开发 / 出海 赛道高信号精选。';

  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background:#f4f5f8;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4f5f8;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e6e8ee;">

          <!-- 品牌 -->
          <tr>
            <td style="padding:26px 28px 14px;">
              <span style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#111827;letter-spacing:0.02em;">ZION · 降噪</span>
              <span style="font-family:'Courier New',monospace;font-size:12px;color:#8a94a6;margin-left:8px;">创业信号周报</span>
              <div style="font-family:'Courier New',monospace;font-size:11px;color:#8a94a6;margin-top:4px;">${esc(TODAY)}　创业 · 独立开发 · 出海</div>
            </td>
          </tr>

          <!-- 本周脉搏 -->
          <tr>
            <td style="padding:0 28px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f7f9ff;border:1px solid #e2e8ff;border-radius:8px;">
                <tr><td style="padding:16px 18px;">
                  <p style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6366f1;">本周脉搏</p>
                  <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">${pulseText}</p>
                  ${themes ? `<div style="margin-top:10px;">${themes}</div>` : ''}
                </td></tr>
              </table>
            </td>
          </tr>

          <!-- 信号列表 -->
          <tr>
            <td style="padding:14px 28px 4px;">
              <p style="margin:0 0 4px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a94a6;">本周高信号 · TOP ${articles.length}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${articles.map((a, i) => articleRow(a, i + 1)).join('')}
              </table>
            </td>
          </tr>

          <!-- 软引导 -->
          <tr>
            <td style="padding:18px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f7f9ff;border-radius:8px;">
                <tr><td style="padding:16px 18px;text-align:center;">
                  <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">
                    想看全部信号 + 每日更新?
                    <a href="${STARTUP_URL}" style="color:#4338ca;text-decoration:none;font-weight:600;">打开 Lens 创业频道 →</a>
                  </p>
                  <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                    更多深度拆解,关注公众号 <strong style="color:#374151;">「Zion降噪」</strong>
                  </p>
                </td></tr>
              </table>
            </td>
          </tr>

          <!-- 页脚 / 退订 -->
          <tr>
            <td style="padding:6px 28px 24px;border-top:1px solid #eef0f4;">
              <p style="margin:12px 0 0;color:#9aa2b1;font-size:11px;line-height:1.7;">
                本邮件汇总第三方公开信息,仅供参考,不构成任何投资或创业建议。
              </p>
              <p style="margin:8px 0 0;color:#9aa2b1;font-size:11px;line-height:1.7;">
                <a href="${STARTUP_URL}" style="color:#9aa2b1;">访问 Lens</a>　·
                <a href="${MANAGE_URL}" style="color:#9aa2b1;">管理订阅 / 退订</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ── 发送 ──────────────────────────────────────────────

async function sendAll(emails, subject, html) {
  if (!emails.length) { console.log('  无活跃订阅者,跳过发送'); return; }

  const chunks = [];
  for (let i = 0; i < emails.length; i += 50) chunks.push(emails.slice(i, i + 50));

  let ok = 0, fail = 0;
  for (const chunk of chunks) {
    const messages = chunk.map(email => ({ from: FROM, to: email, subject, html }));
    try {
      const { error } = await resend.batch.send(messages);
      if (error) { fail += chunk.length; console.error('  批量发送错误:', error); }
      else { ok += chunk.length; console.log(`  已发送 ${chunk.length} 封`); }
    } catch (e) {
      fail += chunk.length;
      console.error('  批量发送异常(不阻断):', e && e.message ? e.message : e);
    }
  }
  console.log(`  汇总:成功 ${ok} / 失败 ${fail} / 共 ${emails.length}`);
}

async function main() {
  console.log('Zion 创业信号周报:', new Date().toISOString());

  const [articles, pulse] = await Promise.all([getTopArticles(10), getLatestPulse()]);
  console.log(`取到文章 ${articles.length} 条,脉搏 ${pulse ? '有' : '无'}`);

  if (!articles.length) { console.log('无文章可发,退出。'); return; }

  const emails = await getSubscribers();
  console.log(`活跃订阅者 ${emails.length} 人`);

  const { subject, html } = buildEmail(articles, pulse);
  console.log(`主题:${subject}`);

  await sendAll(emails, subject, html);
  console.log('完成。');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
