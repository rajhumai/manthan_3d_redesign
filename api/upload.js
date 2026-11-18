import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileName, fileBase64, contentType } = req.body;
    if (!fileName || !fileBase64) return res.status(400).json({ error: 'The impression could not be stored.' });

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > 4 * 1024 * 1024) return res.status(400).json({ error: 'Please use a photo under 4 MB.' });

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const { error } = await supabase.storage
      .from('palm-photos')
      .upload(path, buffer, { contentType: contentType || 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from('palm-photos').getPublicUrl(path);
    return res.status(200).json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
