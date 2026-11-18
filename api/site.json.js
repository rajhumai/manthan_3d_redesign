import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [{ data: contentRow, error: contentErr }, { data: packages, error: pkgErr }, { data: bookings, error: bookErr }] = await Promise.all([
      supabase.from('site_content').select('data').limit(1).maybeSingle(),
      supabase.from('packages').select('*').order('sort', { ascending: true }),
      supabase.from('bookings').select('package_name, status, mode, preferred_date, birth_place, created_at').order('created_at', { ascending: false }).limit(3),
    ]);
    if (contentErr) throw contentErr;
    if (pkgErr) throw pkgErr;
    if (bookErr) throw bookErr;

    const { count: ledgerCount, error: countErr } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true });
    if (countErr) throw countErr;

    const ledger = (bookings || []).map((b) => {
      const city = (b.birth_place || '').split(',')[0].trim() || 'Private';
      return {
        public_label: `${city} · ${b.package_name} · ${b.preferred_date}`,
        status: b.status,
        mode: b.mode,
        preferred_date: b.preferred_date,
      };
    });

    const data = contentRow?.data || {};
    return res.status(200).json({
      ...data,
      packages: packages || [],
      ledger,
      ledger_count: ledgerCount || 0,
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
