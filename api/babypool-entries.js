import { kv } from '@vercel/kv';

const ENTRIES_KEY = 'babypool:entries';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const entries = await kv.lrange(ENTRIES_KEY, 0, -1) || [];
    // Sort by submission time
    entries.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    return res.json(entries);
  }

  if (req.method === 'POST') {
    const { name, date, weightLbs, weightOz, gender } = req.body;

    // Deadline check
    if (new Date() > new Date('2026-05-11T23:59:59')) {
      return res.status(400).json({ error: 'Submissions are closed! Deadline was May 11, 2026.' });
    }

    if (!name?.trim() || !date || weightLbs == null || weightOz == null || !gender) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (date < '2026-05-04' || date > '2026-06-30') {
      return res.status(400).json({ error: 'Date must be between May 4 and June 30, 2026.' });
    }

    if (weightLbs < 3 || weightLbs > 13) {
      return res.status(400).json({ error: 'Weight must be between 3-13 lbs.' });
    }

    if (weightOz < 0 || weightOz > 15) {
      return res.status(400).json({ error: 'Ounces must be between 0-15.' });
    }

    const entries = await kv.lrange(ENTRIES_KEY, 0, -1) || [];

    if (entries.some(e => e.name.toLowerCase() === name.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Someone with that name already entered!' });
    }

    const entry = {
      id: crypto.randomUUID(),
      name: name.trim(),
      date,
      weightLbs: Number(weightLbs),
      weightOz: Number(weightOz),
      gender,
      paid: false,
      submittedAt: new Date().toISOString(),
    };

    await kv.rpush(ENTRIES_KEY, entry);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
