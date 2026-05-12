window.CL = window.CL || {};
window.CL.affiliate = {
  async track(affiliateName, articleId) {
    await window.CL.supabase
      .from('affiliate_clicks')
      .insert({ affiliate_name: affiliateName, article_id: articleId || null });
  },
  trackRead(articleId) {}
};
