import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import cars from './cars.json';
import './App.css';

type Car = typeof cars[0];

// ⚙️ Настройки скидок. Меняйте цифры под себя.
const DISCOUNTS = [
  { minDays: 20, percent: 20 },
  { minDays: 10, percent: 15 },
  { minDays: 5,  percent: 10 },
];

function getDiscountPercent(days: number): number {
  for (const d of DISCOUNTS) {
    if (days >= d.minDays) return d.percent;
  }
  return 0;
}

function calcPrice(pricePerDay: number, days: number) {
  const base = pricePerDay * days;
  const percent = getDiscountPercent(days);
  const discount = Math.round(base * percent / 100);
  const total = base - discount;
  return { base, percent, discount, total };
}

// 🔍 Надёжно достаём данные пользователя из Telegram.
function getTgUser(): any {
  try {
    const tg: any = (window as any).Telegram?.WebApp;
    const u = tg?.initDataUnsafe?.user;
    if (u?.id) return u;
  } catch {}
  try {
    const u: any = (WebApp as any)?.initDataUnsafe?.user;
    if (u?.id) return u;
  } catch {}
  return null;
}

export default function App() {
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [days, setDays] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState('');

  useEffect(() => {
    try {
      (window as any).Telegram?.WebApp?.ready?.();
      (window as any).Telegram?.WebApp?.expand?.();
      WebApp?.ready?.();
      WebApp?.expand?.();
      const u = getTgUser();
      if (u?.first_name) {
        setName(u.first_name);
      }

      // 🐞 Отладка: собираем всё, что видит приложение
      const initData: string =
        (window as any).Telegram?.WebApp?.initData ||
        (WebApp as any)?.initData || '';
      const info = [
        `platform: ${(window as any).Telegram?.WebApp?.platform ?? '—'}`,
        `version: ${(window as any).Telegram?.WebApp?.version ?? '—'}`,
        `initData length: ${initData.length}`,
        `user: ${u ? JSON.stringify(u) : 'null'}`,
      ].join('\n');
      setDebug(info);
      console.log('DEBUG Telegram:', info);
    } catch (e) {
      console.log('Telegram WebApp недоступен — работаем в браузере', e);
      setDebug('Ошибка: ' + String(e));
    }
  }, []);

  const price = selectedCar
    ? calcPrice(selectedCar.price, days)
    : { base: 0, percent: 0, discount: 0, total: 0 };

  async function submit() {
    if (!selectedCar || !phone) return;
    setSending(true);
    setError('');

    const u = getTgUser();

    try {
      const res = await fetch('https://blackrent-mini-app.vercel.app/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          car: `${selectedCar.brand} ${selectedCar.model}`,
          days,
          pricePerDay: selectedCar.price,
          base: price.base,
          discount: price.discount,
          percent: price.percent,
          total: price.total,
          name,
          phone,
          tgUser: u?.username ?? null,
          tgId: u?.id ?? null,
          tgFirstName: u?.first_name ?? null,
          tgLastName: u?.last_name ?? null,
        }),
      });

      if (!res.ok) throw new Error('Ошибка сервера');

      setSent(true);
      WebApp.HapticFeedback?.notificationOccurred('success');
    } catch (e) {
      console.error(e);
      setError('Не удалось отправить заявку. Позвоните нам: +7 (999) 000-00-00');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="wrap">
        <h1>✅ Заявка отправлена!</h1>
        <p>Менеджер свяжется с вами в течение 15 минут.</p>
        <button className="primary" onClick={() => { setSent(false); setSelectedCar(null); }}>
          Выбрать ещё авто
        </button>
      </div>
    );
  }

  if (selectedCar) {
    return (
      <div className="wrap">
        <button className="back" onClick={() => setSelectedCar(null)}>← Назад</button>
        <img src={selectedCar.photo} alt="" className="big-photo" />
        <h1>
          {selectedCar.brand} {selectedCar.model}
          {selectedCar.year > 0 ? `, ${selectedCar.year}` : ''}
        </h1>
        <p className="sub">
          {selectedCar.transmission} · {selectedCar.fuel}
          {selectedCar.color ? ` · ${selectedCar.color}` : ''}
          {selectedCar.body ? ` · ${selectedCar.body}` : ''}
        </p>
        <p className="price-big">{selectedCar.price} ₽ / сутки</p>
        <p className="deposit">Залог: {selectedCar.deposit} ₽</p>

        <label>Сколько суток?</label>
        <input type="number" min={1} value={days}
               onChange={e => setDays(Math.max(1, Number(e.target.value)))} />

        {price.percent > 0 && (
          <p className="discount-hint">
            🎉 Скидка {price.percent}% при аренде от {DISCOUNTS.find(d => d.percent === price.percent)?.minDays} суток
          </p>
        )}
        {price.percent === 0 && days < 5 && (
          <p className="discount-hint-muted">
            От 5 суток — скидка 10%
          </p>
        )}

        <div className="price-breakdown">
          <div className="row">
            <span>Стоимость за {days} сут.</span>
            <span>{price.base} ₽</span>
          </div>
          {price.discount > 0 && (
            <div className="row discount">
              <span>Скидка {price.percent}%</span>
              <span>−{price.discount} ₽</span>
            </div>
          )}
          <div className="row total-row">
            <span>Итого</span>
            <span>{price.total} ₽</span>
          </div>
        </div>

        <label>Ваше имя</label>
        <input value={name} onChange={e => setName(e.target.value)} />

        <label>Телефон *</label>
        <input value={phone} placeholder="+7..." 
               onChange={e => setPhone(e.target.value)} />

        {error && <p className="error-msg">{error}</p>}
        <button className="primary" onClick={submit} disabled={!phone || sending}>
          {sending ? 'Отправляем...' : 'Отправить заявку'}
        </button>

        {/* 🐞 Отладочный блок — потом удалим */}
        <pre style={{
          fontSize: 10,
          color: '#888',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          marginTop: 16,
          padding: 8,
          background: '#f0f0f0',
          borderRadius: 6,
          lineHeight: 1.4,
        }}>
{debug}
        </pre>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Аренда авто в СПб</h1>
      <p className="sub">{cars.length} машин в наличии · скидки до 20%</p>
      {cars.map(car => (
        <div key={car.id} className="card" onClick={() => setSelectedCar(car)}>
          <img src={car.photo} alt="" />
          <div className="info">
            <b>{car.brand} {car.model}</b>
            <span>{car.year > 0 ? `${car.year} · ` : ''}{car.transmission}</span>
            <span className="price">{car.price} ₽ / сутки</span>
          </div>
        </div>
      ))}
    </div>
  );
}