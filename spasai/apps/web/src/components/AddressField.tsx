import { useEffect, useId, useRef, useState } from 'react';

import { api } from '../lib/api';
import type { AddressSuggestion } from '../lib/api';

export interface PickedAddress {
  value: string;
  lat: number;
  lng: number;
  timezone: string | null;
}

const PRECISION_WARNING: Record<string, string> = {
  street: 'Адрес найден только до улицы — покупатель не поймёт, к какой двери идти',
  city: 'Адрес найден только до города — уточните улицу и дом',
  none: 'Координаты по этому адресу не определились',
};

/**
 * Адрес с подсказками из реестра. Заведение выбирает строку — координаты
 * и часовой пояс подставляются сами.
 *
 * Ввод широты и долготы руками убран намеренно: на этих координатах держится
 * весь геопоиск, а ошибиться в них проще простого.
 */
export function AddressField({
  onPick,
  defaultValue = '',
}: {
  onPick: (address: PickedAddress | null) => void;
  defaultValue?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [picked, setPicked] = useState<AddressSuggestion | null>(null);
  const [open, setOpen] = useState(false);
  /** Подсказки выключены на сервере — тогда координаты вводятся руками. */
  const [manual, setManual] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (picked?.value === query || query.trim().length < 3) {
      setOptions([]);
      return;
    }

    // Пауза, чтобы не дёргать реестр на каждую букву.
    const timer = setTimeout(() => {
      void api<AddressSuggestion[]>(`/merchants/address-suggest?query=${encodeURIComponent(query)}`)
        .then((list) => {
          setOptions(list);
          setOpen(list.length > 0);
          if (list.length === 0 && query.trim().length > 6) setManual(true);
        })
        .catch(() => setManual(true));
    }, 350);

    return () => clearTimeout(timer);
  }, [query, picked]);

  // Клик мимо списка — закрыть подсказки.
  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  function pick(option: AddressSuggestion) {
    setPicked(option);
    setQuery(option.value);
    setOpen(false);

    onPick(
      option.lat !== null && option.lng !== null
        ? { value: option.value, lat: option.lat, lng: option.lng, timezone: option.timezone }
        : null,
    );
  }

  const warning = picked ? PRECISION_WARNING[picked.precision] : undefined;

  return (
    <div className="form" ref={box}>
      <div className="field" style={{ position: 'relative' }}>
        <span>Адрес</span>
        <input
          name="address"
          required
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
            onPick(null);
          }}
          onFocus={() => setOpen(options.length > 0)}
          placeholder="Москва, ул. Тверская, 1"
        />

        {open && (
          <ul className="suggest" id={listId} role="listbox">
            {options.map((option) => (
              <li key={option.value}>
                <button type="button" role="option" aria-selected={false} onClick={() => pick(option)}>
                  {option.value}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picked && picked.lat !== null && picked.lng !== null && (
        <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Координаты: {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
          {picked.timezone && ` · часовой пояс ${picked.timezone}`}
        </p>
      )}

      {warning && <div className="alert alert--warn">{warning}</div>}

      {manual && !picked && (
        <>
          <div className="alert alert--warn">
            Подсказки адресов недоступны — введите координаты вручную. Найти их можно на
            yandex.ru/maps: правый клик по точке → «Что здесь?».
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Широта</span>
              <input name="lat" type="number" step="any" required placeholder="55.7601" />
            </label>
            <label className="field">
              <span>Долгота</span>
              <input name="lng" type="number" step="any" required placeholder="37.6089" />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
