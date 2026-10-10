import { useState, useEffect, useMemo } from 'react';
import WebApp from '@twa-dev/sdk';
import cars from './cars.json';
import './App.css';

type Car = typeof cars[0];
type CarStatus = 'available' | 'busy' | 'service';

// 👤 Ваш Telegram ID — только вы видите кнопку управления
const ADMIN_IDS = ['1848294582'];

const DISCOUNTS = [
  { minDays: 20, percent: 20 },
  { minDays: 10, percent: 15 },
  { minDays: 5,  percent: 10 },
];

const PRICE_RANGES = [
  { label: 'Все цены', min: 0, max: Infinity },
  { label: 'до 3 000 ₽', min: 0, max: 3000 },
  { label: '3 000 – 5 000 ₽', min: 3000, max: 5000 },
  { label: '5 000 – 10 000 ₽', min: 5000, max: 10000 },
  { label: 'от 10 000 ₽', min: 10000, max: Infinity },
];

const QUICK_DAYS = [1, 3, 5, 7, 10, 14, 30];
const MANAGER_PHONE = '+79990000000';
const MANAGER_TG = 'blackrent_spb';

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

function getInitData(): string {
  try {
    return (window as any).Telegram?.WebApp?.initData ?? '';
  } catch {
    return '';
  }
}

function isAdminUser(): boolean {
  const u = getTgUser();
  return u?.id && ADMIN_IDS.includes(String(u.id));
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

function formatBusyUntil(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}.${d.getFullYear()}`;
  } catch {
    return '';
  }
}

// Дата возврата в будущем?
function isStillBusy(busyUntil?: string): boolean {
  if (!busyUntil) return true;
  const end = new Date(busyUntil);
  if (isNaN(end.getTime())) return true;
  end.setHours(23, 59, 59, 999);
  return end.getTime() >= Date.now();
}

type StatusMap = Record<string, { status: CarStatus; busyUntil?: string }>;

function getStatus(id: number, map: StatusMap): CarStatus {
  const entry = map[String(id)];
  if (!entry) return 'available';
  if (entry.status === 'busy' && entry.busyUntil && !isStillBusy(entry.busyUntil)) {
    return 'available';
  }
  return entry.status;
}

function statusInfo(status: CarStatus, busyUntil?: string) {
  if (status === 'available') return null;
  if (status === 'service') return { text: 'На обслуживании', short: 'ТО', className: 'status-service' };
  const until = formatBusyUntil(busyUntil);
  return {
    text: until ? `Занята до ${until}` : 'Занята',
    short: 'Занята',
    className: 'status-busy',
  };
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
  const [priceRange, setPriceRange] = useState(0);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [showAdmin, setShowAdmin] = useState(false);

  // Загружаем статусы из API при старте
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

    loadStatuses();
  }, []);

  async function loadStatuses() {
    try {
      const res = await fetch('https://blackrent-mini-app.vercel.app/api/statuses');
      if (res.ok) {
        const data = await res.json();
        setStatusMap(data || {});
      }
    } catch (e) {
      console.warn('Не удалось загрузить статусы', e);
    }
  }

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    cars.forEach(c => {
      const b = normalizeBody((c as any).body);
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, []);

  const filteredCars = useMemo(() => {
    let result = cars.slice();

    if (bodyFilter !== 'Все') {
      result = result.filter(c => normalizeBody((c as any).body) === bodyFilter);
    }

    const range = PRICE_RANGES[priceRange];
    result = result.filter(c => c.price >= range.min && c.price < range.max);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(c =>
        `${c.brand} ${c.model}`.toLowerCase().includes(q)
      );
    }

    if (onlyAvailable) {
      result = result.filter(c => getStatus(c.id, statusMap) === 'available');
    }

    if (sortOrder === 'asc') result.sort((a, b) => a.price - b.price);
    else if (sortOrder === 'desc') result.sort((a, b) => b.price - a.price);

    return result;
  }, [bodyFilter, priceRange, sortOrder, search, onlyAvailable, statusMap]);

  const price = selectedCar
    ? calcPrice(selectedCar.price, days)
    : { base: 0, percent: 0, discount: 0, total: 0 };

  const phoneReady = isPhoneComplete(phone);

  const similarCars = useMemo(() => {
    if (!selectedCar) return [];
    return cars
      .filter(c => c.id !== selectedCar.id)
      .filter(c => normalizeBody((c as any).body) === normalizeBody((selectedCar as any).body))
      .slice(0, 4);
  }, [selectedCar]);

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
      setError('Не удалось отправить заявку. Позвоните нам.');
    } finally {
      setSending(false);
    }
  }

  // ===== АДМИН-ПАНЕЛЬ =====
  async function updateStatus(
    carId: number,
    newStatus: CarStatus,
    busyUntil?: string
  ) {
    try {
      const res = await fetch('https://blackrent-mini-app.vercel.app/api/statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: carId,
          status: newStatus,
          busyUntil,
          initData: getInitData(),
        }),
      });
      if (!res.ok) throw new Error('Ошибка сервера');
      const data = await res.json();
      setStatusMap(data.data || {});
      WebApp.HapticFeedback?.notificationOccurred('success');
    } catch (e) {
      console.error(e);
      WebApp.showAlert?.('Не удалось сохранить статус');
    }
  }

  // ===== ЭКРАН УСПЕХА =====
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

  // ===== АДМИН-ПАНЕЛЬ =====
  if (showAdmin) {
    return (
      <div className="wrap">
        <button className="back" onClick={() => setShowAdmin(false)}>← Назад к каталогу</button>
        <h1 className="admin-title">Управление статусами</h1>
        <p className="admin-hint">
          Отметьте машины, которые сейчас в аренде или на ТО.
          Клиенты сразу увидят это в каталоге.
        </p>

        <div className="admin-list">
          {cars.map(car => {
            const status = getStatus(car.id, statusMap);
            const entry = statusMap[String(car.id)];
            return (
              <div key={car.id} className="admin-row">
                <div className="admin-row-info">
                  <b>{car.brand} {car.model}</b>
                  <span className="admin-row-id">ID: {car.id}</span>
                </div>
                <div className="admin-row-actions">
                  <button
                    className={`admin-btn ${status === 'available' ? 'active-green' : ''}`}
                    onClick={() => updateStatus(car.id, 'available')}
                  >
                    Свободна
                  </button>
                  <button
                    className={`admin-btn ${status === 'busy' ? 'active-red' : ''}`}
                    onClick={() => {
                      const input = prompt('Дата возврата (ГГГГ-ММ-ДД), можно пусто:', entry?.busyUntil || '');
                      if (input === null) return;
                      updateStatus(car.id, 'busy', input.trim() || undefined);
                    }}
                  >
                    Занята
                  </button>
                  <button
                    className={`admin-btn ${status === 'service' ? 'active-gray' : ''}`}
                    onClick={() => updateStatus(car.id, 'service')}
                  >
                    ТО
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===== ДЕТАЛЬНАЯ КАРТОЧКА =====
  if (selectedCar) {
    const status = getStatus(selectedCar.id, statusMap);
    const entry = statusMap[String(selectedCar.id)];
    const info = statusInfo(status, entry?.busyUntil);

    return (
      <div className="wrap">
        <button className="back" onClick={() => setSelectedCar(null)}>← Назад</button>

        <div className="detail-hero">
          <img src={selectedCar.photo} alt="" className="big-photo" />
          <div className="detail-hero-overlay">
            {info && (
              <span className={`status-badge-inline ${info.className}`}>
                {info.text}
              </span>
            )}
            <h1 className="detail-title">
              {selectedCar.brand} {selectedCar.model}
              {selectedCar.year > 0 ? `, ${selectedCar.year}` : ''}
            </h1>
          </div>
        </div>

        <div className="specs-chips">
          {selectedCar.transmission && <span className="spec-chip">⚙️ {selectedCar.transmission}</span>}
          {selectedCar.fuel && <span className="spec-chip">⛽ {selectedCar.fuel}</span>}
          {selectedCar.body && <span className="spec-chip">🚗 {normalizeBody(selectedCar.body)}</span>}
          {selectedCar.color && <span className="spec-chip">🎨 {selectedCar.color}</span>}
        </div>

        <div className="detail-price-card">
          <div className="detail-price-left">
            <div className="price-big">{selectedCar.price} ₽</div>
            <div className="price-label">за сутки</div>
          </div>
          <div className="detail-price-right">
            <div className="deposit-label">Залог</div>
            <div className="deposit-value">{selectedCar.deposit} ₽</div>
          </div>
        </div>

        <label>Сколько суток?</label>
        <div className="quick-days">
          {QUICK_DAYS.map(d => (
            <button
              key={d}
              className={`quick-day-btn ${days === d ? 'active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}
            </button>
          ))}
        </div>

        <input
          type="number"
          min={1}
          value={days}
          onChange={e => setDays(Math.max(1, Number(e.target.value)))}
          className="days-input"
        />

        {price.percent > 0 && (
          <div className="discount-badge">🎉 Скидка {price.percent}% применена</div>
        )}
        {price.percent === 0 && days < 5 && (
          <p className="discount-hint-muted">От 5 суток — скидка 10%</p>
        )}

        <div className="price-breakdown">
          <div className="row">
            <span>Стоимость за {days} {plural(days, 'сутки', 'суток', 'суток')}</span>
            <span>{price.base.toLocaleString('ru-RU')} ₽</span>
          </div>
          {price.discount > 0 && (
            <div className="row discount">
              <span>Скидка {price.percent}%</span>
              <span>−{price.discount.toLocaleString('ru-RU')} ₽</span>
            </div>
          )}
          <div className="row total-row">
            <span>Итого</span>
            <span>{price.total.toLocaleString('ru-RU')} ₽</span>
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

        <div className="contact-buttons">
          <a href={`tel:${MANAGER_PHONE}`} className="contact-btn contact-btn-phone">📞 Позвонить</a>
          <a href={`https://t.me/${MANAGER_TG}`} target="_blank" rel="noopener noreferrer" className="contact-btn contact-btn-tg">💬 Написать</a>
        </div>

        {similarCars.length > 0 && (
          <div className="similar-section">
            <h2 className="similar-title">Похожие авто</h2>
            {similarCars.map(car => {
              const s = getStatus(car.id, statusMap);
              const i = statusInfo(s, statusMap[String(car.id)]?.busyUntil);
              return (
                <div
                  key={car.id}
                  className="card"
                  onClick={() => {
                    setSelectedCar(car);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <div className="card-photo">
                    <img src={car.photo} alt="" />
                    {i && <span className={`status-badge ${i.className}`}>{i.short}</span>}
                  </div>
                  <div className="info">
                    <b>{car.brand} {car.model}</b>
                    <span className="car-sub">
                      {car.year > 0 ? `${car.year} · ` : ''}{car.transmission}
                    </span>
                    <span className="price">{car.price} ₽<span className="price-unit">/сутки</span></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ===== КАТАЛОГ =====
  return (
    <div className="wrap">
      <header className="app-header">
        <div className="brand">BlackRent</div>
        <div className="brand-tagline">Аренда авто в Санкт-Петербург</div>
      </header>

      {isAdminUser() && (
        <button className="admin-open-btn" onClick={() => setShowAdmin(true)}>
          ⚙️ Управление статусами
        </button>
      )}

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

      <div className="filters">
        <button
          className={`filter-btn ${bodyFilter === 'Все' ? 'active' : ''}`}
          onClick={() => setBodyFilter('Все')}
        >
          Все ({cars.length})
        </button>
        {categories.map(([catName, count]) => (
          <button
            key={catName}
            className={`filter-btn ${bodyFilter === catName ? 'active' : ''}`}
            onClick={() => setBodyFilter(catName)}
          >
            {catName} ({count})
          </button>
        ))}
      </div>

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

      <div className="catalog-bar">
        <span className="counter">
          {filteredCars.length} {plural(filteredCars.length, 'машина', 'машины', 'машин')}
        </span>
        <button
          className={`sort-btn ${onlyAvailable ? 'active' : ''}`}
          onClick={() => setOnlyAvailable(v => !v)}
          style={{ marginRight: 8 }}
        >
          {onlyAvailable ? '✓ Свободные' : 'Только свободные'}
        </button>
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

      {filteredCars.map(car => {
        const s = getStatus(car.id, statusMap);
        const info = statusInfo(s, statusMap[String(car.id)]?.busyUntil);
        const isUnavailable = s !== 'available';
        return (
          <div
            key={car.id}
            className={`card ${isUnavailable ? 'card-unavailable' : ''}`}
            onClick={() => setSelectedCar(car)}
          >
            <div className="card-photo">
              <img src={car.photo} alt="" />
              {info && <span className={`status-badge ${info.className}`}>{info.short}</span>}
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
        );
      })}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}