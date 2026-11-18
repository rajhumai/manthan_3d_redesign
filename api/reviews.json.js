import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [{ data: reviews, error: revErr }, { data: contentRow, error: contentErr }] = await Promise.all([
      supabase.from('reviews').select('*').order('sort', { ascending: true }),
      supabase.from('site_content').select('data').limit(1).maybeSingle(),
    ]);
    if (revErr) throw revErr;
    if (contentErr) throw contentErr;

    const copy = contentRow?.data?.copy || {};
    return res.status(200).json({
      rating: copy.google_rating || '4.9',
      count: copy.google_review_count || String((reviews || []).length),
      reviews: reviews || [],
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
