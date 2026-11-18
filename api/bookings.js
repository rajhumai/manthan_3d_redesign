import supabase from './db-client.js';

function generateReference() {
  const t = Date.now().toString(36).toUpperCase().slice(-5);
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SJ-${t}${r}`;
}

function validate(body, packagesBySlug) {
  const errors = {};
  const full_name = (body.full_name || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const package_slug = (body.package_slug || '').trim();
  const preferred_date = (body.preferred_date || '').trim();
  const birth_date = (body.birth_date || '').trim();
  const birth_place = (body.birth_place || '').trim();
  const focus = (body.focus || '').trim();
  const mode = body.mode === 'chamber' ? 'chamber' : 'online';

  if (full_name.length < 2) errors.full_name = 'Enter the name the sitting should be held under.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'A valid email is required for the recording.';
  if (phone.replace(/\D/g, '').length < 8) errors.phone = 'Enter a reachable phone or WhatsApp number.';
  if (!package_slug || !packagesBySlug[package_slug]) errors.package_slug = 'Choose a consultation.';
  if (!preferred_date) errors.preferred_date = 'Choose a preferred date.';
  if (!birth_date) errors.birth_date = 'Birth date is required for the past audit.';
  if (birth_place.length < 2) errors.birth_place = 'Birth place is required to set the ascendant.';
  if (focus.length < 8) errors.focus = 'Describe the decision in a sentence or two.';
  if (mode === 'chamber' && preferred_date) {
    const day = new Date(`${preferred_date}T12:00:00`).getDay();
    if (day !== 4 && day !== 6) errors.preferred_date = 'The Gurugram chamber sits on Thursdays and Saturdays.';
  }
  return errors;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const reference = (req.query.reference || '').trim();
      const email = (req.query.email || '').trim().toLowerCase();
      if (!reference || !email) return res.status(400).json({ error: 'Both the reference and the email on the sitting are required.' });

      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .ilike('reference', reference)
        .eq('email', email)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'The sitting could not be opened.' });
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { data: packages, error: pkgErr } = await supabase.from('packages').select('*');
      if (pkgErr) throw pkgErr;
      const packagesBySlug = {};
      (packages || []).forEach((p) => { packagesBySlug[p.slug] = p; });

      const errors = validate(req.body, packagesBySlug);
      const firstField = Object.keys(errors)[0];
      if (firstField) return res.status(400).json({ field: firstField, error: errors[firstField] });

      const b = req.body;
      const pkg = packagesBySlug[b.package_slug];
      const currency = b.currency === 'USD' ? 'USD' : 'INR';
      const amount = currency === 'USD' ? pkg.price_usd : pkg.price_inr;
      const mode = b.mode === 'chamber' ? 'chamber' : 'online';

      let inserted = null;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const reference = generateReference();
        const { data, error } = await supabase
          .from('bookings')
          .insert({
            reference,
            full_name: b.full_name.trim(),
            email: b.email.trim().toLowerCase(),
            phone: b.phone.trim(),
            package_slug: pkg.slug,
            package_name: pkg.name,
            amount,
            currency,
            mode,
            preferred_date: b.preferred_date,
            birth_date: b.birth_date,
            birth_time: b.birth_time || null,
            birth_place: b.birth_place.trim(),
            focus: b.focus.trim(),
            notes: b.notes || null,
            palm_url: b.palm_url || null,
            status: 'requested',
          })
          .select()
          .single();
        if (error && error.code === '23505') continue; // reference collision, retry
        if (error) throw error;
        inserted = data;
      }
      if (!inserted) throw new Error('Could not generate a unique reference, please try again.');
      return res.status(201).json(inserted);
    }

    if (req.method === 'PUT') {
      const { reference, email, preferred_date, phone, focus, notes } = req.body;
      if (!reference || !email) return res.status(400).json({ error: 'Both the reference and the email on the sitting are required.' });
      if ((phone || '').replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Enter a reachable phone number.' });
      if (!preferred_date) return res.status(400).json({ error: 'A preferred date is required.' });

      const { data: existing, error: findErr } = await supabase
        .from('bookings')
        .select('*')
        .ilike('reference', reference)
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();
      if (findErr) throw findErr;
      if (!existing) return res.status(404).json({ error: 'The sitting could not be updated.' });

      const { data, error } = await supabase
        .from('bookings')
        .update({ preferred_date, phone, focus: focus || existing.focus, notes: notes || existing.notes })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { reference, email } = req.body;
      if (!reference || !email) return res.status(400).json({ error: 'Both the reference and the email on the sitting are required.' });

      const { data: existing, error: findErr } = await supabase
        .from('bookings')
        .select('id')
        .ilike('reference', reference)
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();
      if (findErr) throw findErr;
      if (!existing) return res.status(404).json({ error: 'The sitting could not be released.' });

      const { error } = await supabase.from('bookings').delete().eq('id', existing.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
