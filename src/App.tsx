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

// 💰 Ценовые диапазоны
const PRICE_RANGES = [
  { label: 'Все цены', min: 0, max: Infinity },
  { label: 'до 3 000 ₽', min: 0, max: 3000 },
  { label: '3 000 – 5 000 ₽', min: 3000, max: 5000 },
  { label: '5 000 – 10 000 ₽', min: 5000, max: 10000 },
  { label: 'от 10 000 ₽', min: 10000, max: Infinity },
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

function isPhoneComplete(phone: string): boolean {
  return phone.replace(/\D/g, '').length === 11;
}

// 🔤 Нормализация названия кузова (приводим к единому виду)
function normalizeBody(body: string): string {
  const map: Record<string, string> = {
    'suv': 'Внедорожник',
    'джип': 'Внедорожник',
    'внедорожник': 'Внедорожник',
    'кроссовер': 'Кроссовер',
    'седан': 'Седан',
    'минивен': 'Минивен',
    'минивэн': 'Минивен',
    'купе': 'Купе',
    'кабриолет': 'Кабриолет',
    'хэтчбек': 'Хэтчбек',
  };
  const key = (body || '').toLowerCase().trim();
  return map[key] || body || 'Прочее';
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
  const [priceRange, setPriceRange] = useState(0); // индекс в PRICE_RANGES
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [search, setSearch] = useState('');

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

  // Категории (по нормализованному body)
  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    cars.forEach(c => {
      const b = normalizeBody((c as any).body);
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, []);

  // Фильтрация + поиск + сортировка
  const filteredCars = useMemo(() => {
    let result = cars.slice();

    // Фильтр по кузову
    if (bodyFilter !== 'Все') {
      result = result.filter(c => normalizeBody((c as any).body) === bodyFilter);
    }

    // Фильтр по цене
    const range = PRICE_RANGES[priceRange];
    result = result.filter(c => c.price >= range.min && c.price < range.max);

    // Поиск по марке/модели
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(c =>
        `${c.brand} ${c.model}`.toLowerCase().includes(q)
      );
    }

    // Сортировка
    if (sortOrder === 'asc') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortOrder === 'desc') {
      result.sort((a, b) => b.price - a.price);
    }

    return result;
  }, [bodyFilter, priceRange, sortOrder, search]);

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
        <div className="success-box">
          <div className="success-icon">✓</div>
          <h1>Заявка отправлена!</h1>
          <p className="sub">Менеджер свяжется с вами в течение 15 минут.</p>
          <button className="primary" onClick={() => { setSent(false); setSelectedCar(null); }}>
            Выбрать ещё авто
          </button>
        </div>
      </div>
    );
  }

  if (selectedCar) {
    return (
      <div className="wrap">
        <button className="back" onClick={() => setSelectedCar(null)}>← Назад</button>

        <div className="hero-photo">
          <img src={selectedCar.photo} alt="" className="big-photo" />
        </div>

        <h1 className="detail-title">
          {selectedCar.brand} {selectedCar.model}
          {selectedCar.year > 0 ? `, ${selectedCar.year}` : ''}
        </h1>

        <p className="detail-specs">
          {selectedCar.transmission} · {selectedCar.fuel}
          {selectedCar.color ? ` · ${selectedCar.color}` : ''}
          {selectedCar.body ? ` · ${normalizeBody(selectedCar.body)}` : ''}
        </p>

        <div className="detail-price-row">
          <div>
            <div className="price-big">{selectedCar.price} ₽</div>
            <div className="price-label">за сутки</div>
          </div>
          <div className="deposit-chip">
            Залог {selectedCar.deposit} ₽
          </div>
        </div>

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
      <header className="app-header">
        <div className="brand">
          <span className="brand-black">Black</span><span className="brand-orange">Rent</span>
        </div>
        <div className="brand-tagline">Премиум аренда · СПб</div>
      </header>

      <div className="search-box">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по марке или модели"
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* Фильтры по кузову */}
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

      {/* Ценовые фильтры */}
      <div className="filters">
        {PRICE_RANGES.map((r, i) => (
          <button
            key={r.label}
            className={`filter-btn price-filter ${priceRange === i ? 'active' : ''}`}
            onClick={() => setPriceRange(i)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Сортировка + счётчик */}
      <div className="catalog-bar">
        <span className="counter">
          {filteredCars.length} {plural(filteredCars.length, 'машина', 'машины', 'машин')}
        </span>
        <button
          className={`sort-btn ${sortOrder !== 'none' ? 'active' : ''}`}
          onClick={() => {
            setSortOrder(sortOrder === 'none' ? 'asc' : sortOrder === 'asc' ? 'desc' : 'none');
          }}
        >
          {sortOrder === 'none' && 'По цене ↕'}
          {sortOrder === 'asc' && 'Дешевле ↑'}
          {sortOrder === 'desc' && 'Дороже ↓'}
        </button>
      </div>

      {filteredCars.length === 0 && (
        <div className="empty-box">
          <div className="empty-icon">🚗</div>
          <p className="empty">Ничего не найдено</p>
          <p className="empty-hint">Попробуйте изменить фильтры или поиск</p>
        </div>
      )}

      {filteredCars.map(car => (
        <div key={car.id} className="card" onClick={() => setSelectedCar(car)}>
          <div className="card-photo">
            <img src={car.photo} alt="" />
          </div>
          <div className="info">
            <b>{car.brand} {car.model}</b>
            <span className="car-sub">
              {car.year > 0 ? `${car.year} · ` : ''}{car.transmission}
              {car.body ? ` · ${normalizeBody(car.body)}` : ''}
            </span>
            <span className="price">{car.price} ₽<span className="price-unit">/сутки</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Склонение слов
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}