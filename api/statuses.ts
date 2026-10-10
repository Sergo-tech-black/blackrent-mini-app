import { kv } from '@vercel/kv';

// Telegram ID владельца — только он может менять статусы
const ADMIN_IDS = ['1848294582'];

type StatusValue = {
  status: 'available' | 'busy' | 'service';
  busyUntil?: string;
};

type StatusMap = Record<string, StatusValue>;

const KEY = 'car-statuses';

// Проверка, что запрос от админа
function isAdmin(initData: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    if (!userJson) return false;
    const user = JSON.parse(userJson);
    return ADMIN_IDS.includes(String(user.id));
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  // GET — вернуть все статусы
  if (req.method === 'GET') {
    try {
      const data = (await kv.get<StatusMap>(KEY)) || {};
      return res.status(200).json(data);
    } catch (e) {
      console.error('KV GET error:', e);
      return res.status(200).json({});
    }
  }

  // POST — обновить статус
  if (req.method === 'POST') {
    const { id, status, busyUntil, initData } = req.body || {};

    if (!isAdmin(initData || '')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!id || !['available', 'busy', 'service'].includes(status)) {
      return res.status(400).json({ error: 'Bad request' });
    }

    try {
      const data = (await kv.get<StatusMap>(KEY)) || {};

      if (status === 'available') {
        delete data[String(id)];
      } else {
        data[String(id)] = {
          status,
          busyUntil: status === 'busy' ? busyUntil : undefined,
        };
      }

      await kv.set(KEY, data);
      return res.status(200).json({ ok: true, data });
    } catch (e) {
      console.error('KV SET error:', e);
      return res.status(500).json({ error: 'KV error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}