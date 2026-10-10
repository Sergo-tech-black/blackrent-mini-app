import { kv } from '@vercel/kv';

const ADMIN_IDS = ['1848294582'];

type StatusValue = {
  status: 'available' | 'busy' | 'service';
  busyUntil?: string;
};

type StatusMap = Record<string, StatusValue>;
type PriceMap = Record<string, number>;

const STATUS_KEY = 'car-statuses';
const PRICE_KEY = 'car-prices';

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
  if (req.method === 'GET') {
    try {
      const statuses = (await kv.get<StatusMap>(STATUS_KEY)) || {};
      const prices = (await kv.get<PriceMap>(PRICE_KEY)) || {};
      return res.status(200).json({ statuses, prices });
    } catch (e) {
      console.error('KV GET error:', e);
      return res.status(200).json({ statuses: {}, prices: {} });
    }
  }

  if (req.method === 'POST') {
    const { initData, type, id } = req.body || {};

    if (!isAdmin(initData || '')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!id) {
      return res.status(400).json({ error: 'Bad request' });
    }

    try {
      if (type === 'status') {
        const { status, busyUntil } = req.body;
        if (!['available', 'busy', 'service'].includes(status)) {
          return res.status(400).json({ error: 'Bad status' });
        }
        const statuses = (await kv.get<StatusMap>(STATUS_KEY)) || {};
        if (status === 'available') {
          delete statuses[String(id)];
        } else {
          statuses[String(id)] = {
            status,
            busyUntil: status === 'busy' ? busyUntil : undefined,
          };
        }
        await kv.set(STATUS_KEY, statuses);
        const prices = (await kv.get<PriceMap>(PRICE_KEY)) || {};
        return res.status(200).json({ statuses, prices });
      }

      if (type === 'price') {
        const price = Number(req.body.price);
        if (!Number.isFinite(price) || price < 0) {
          return res.status(400).json({ error: 'Bad price' });
        }
        const prices = (await kv.get<PriceMap>(PRICE_KEY)) || {};
        prices[String(id)] = Math.round(price);
        await kv.set(PRICE_KEY, prices);
        const statuses = (await kv.get<StatusMap>(STATUS_KEY)) || {};
        return res.status(200).json({ statuses, prices });
      }

      return res.status(400).json({ error: 'Unknown type' });
    } catch (e) {
      console.error('KV SET error:', e);
      return res.status(500).json({ error: 'KV error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}