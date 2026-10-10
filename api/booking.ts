// Serverless-функция Vercel: принимает заявку из Mini App и шлёт её в Telegram
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID;

  if (!BOT_TOKEN || !MANAGER_CHAT_ID) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const {
    car, days, pricePerDay, base, discount, percent, total,
    name, phone, tgUser, tgId,
  } = req.body || {};

  if (!car || !phone) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const text = [
    '🚗 Новая заявка BlackRent',
    '',
    `Автомобиль: ${car}`,
    `Суток: ${days}`,
    `Цена за сутки: ${pricePerDay} ₽`,
    `Стоимость: ${base} ₽`,
    discount > 0 ? `Скидка ${percent}%: −${discount} ₽` : null,
    `Итого: ${total} ₽`,
    '',
    `Клиент: ${name || '—'}`,
    `Телефон: ${phone}`,
    tgUser ? `Telegram: @${tgUser}` : (tgId ? `Telegram ID: ${tgId}` : 'Telegram: —'),
  ].filter(Boolean).join('\n');

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: MANAGER_CHAT_ID, text }),
    });

    if (!tgRes.ok) {
      const err = await tgRes.text();
      console.error('Telegram API error:', err);
      return res.status(500).json({ error: 'Telegram failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Unexpected error:', e);
    return res.status(500).json({ error: 'Unexpected' });
  }
}