import { useState, useEffect, useMemo } from 'react';
import WebApp from '@twa-dev/sdk';
import cars from './cars.json';
import './App.css';

type Car = typeof cars[0];

// ⚙️ Настройки скидок
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

// 🔍 Достаём данные пользователя из Telegram
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

// 📞 Маска телефона: +7 (XXX) XXX-XX-XX
function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits[0] === '8') digits = '7' + digits.slice(1);
  if (digits[0] !== '7') digits = '7' + digits;
  digits = digits.slice(0, 11);

  let r = '+7';
  if (digits.length > 1) r += ' (' + digits.slice(1, 4);
  if (digits.length >= 5) r += ') ' + digits.slice(4, 7);
  if (digits.length >= 8) r += '-' + digits.slice(7, 9);
  if (digits.length >= 10) r += '-' + digits.slice(9, 11);
  return r;
}

// ✅ Проверка, что номер заполнен полностью
function isPhoneComplete(phone: string): boolean {
  return phone.replace(/\D/g, '').length === 11;
}

export default function App() {
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [days, setDays] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [bodyFilter, setBodyFilter] = useState('Все');

  useEffect(() => {
    try {
      (window as any).Telegram?.WebApp?.ready?.();
      (window as any).Telegram?.WebApp?.expand?.();
      WebApp?.ready?.();
      WebApp?.expand?.();
      const u = getTgUser();
      if (u?.first_name) setName(u.first_name);
    } catch (e) {
      console.log('Telegram WebApp недоступен', e);
    }
  }, []);

  // Считаем категории (по полю body) и количество в каждой
  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    cars.forEach(c => {
      const b = (c as any).body || 'Прочее';
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, []);

  // Отфильтрованные машины
  const filteredCars = useMemo(() => {
    if (bodyFilter === 'Все') return cars;
    return cars.filter(c => ((c as any).body || 'Прочее') === bodyFilter);
  }, [bodyFilter]);

  const price = selectedCar
    ? calcPrice(selectedCar.price, days)
    : { base: 0, percent: 0, discount: 0, total: 0 };

  const phoneReady = isPhoneComplete(phone);

  async function submit() {
    if (!selectedCar || !phoneReady) return;
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
          <p className="discount-hint-muted">От 5 суток — скидка 10%</p>
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
        <input
          value={phone}
          placeholder="+7 (___) ___-__-__"
          inputMode="tel"
          onChange={e => setPhone(formatPhone(e.target.value))}
        />

        {error && <p className="error-msg">{error}</p>}
        <button className="primary" onClick={submit} disabled={!phoneReady || sending}>
          {sending ? 'Отправляем...' : 'Отправить заявку'}
        </button>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Аренда авто в СПб</h1>
      <p className="sub">
        {filteredCars.length} из {cars.length} машин · скидки до 20%
      </p>

      <div className="filters">
        <button
          className={`filter-btn ${bodyFilter === 'Все' ? 'active' : ''}`}
          onClick={() => setBodyFilter('Все')}
        >
          Все ({cars.length})
        </button>
        {categories.map(([name, count]) => (
          <button
            key={name}
            className={`filter-btn ${bodyFilter === name ? 'active' : ''}`}
            onClick={() => setBodyFilter(name)}
          >
            {name} ({count})
          </button>
        ))}
      </div>

      {filteredCars.length === 0 && (
        <p className="empty">В этой категории пока нет машин</p>
      )}

      {filteredCars.map(car => (
        <div key={car.id} className="card" onClick={() => setSelectedCar(car)}>
          <img src={car.photo} alt="" />
          <div className="info">
            <b>{car.brand} {car.model}</b>
            <span className="car-sub">
              {car.year > 0 ? `${car.year} · ` : ''}{car.transmission}
            </span>
            <span className="price">{car.price} ₽ / сутки</span>
          </div>
        </div>
      ))}
    </div>
  );
}