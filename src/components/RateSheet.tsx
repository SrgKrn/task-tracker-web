import { useState } from 'react'
import { Button, Segmented, Sheet, SheetActions, fieldClass } from './ui'
import { RATE_CURRENCIES, formatRate, type RateCurrency } from '../lib/rate'

export interface RateValue {
  hourly_rate: number | null
  rate_currency: RateCurrency | null
}

/**
 * Ввод ставки в час и валюты. У спринта есть «Как у клиента» — сбросить свою ставку.
 * Пустое поле — ставки нет.
 */
export function RateSheet({
  open,
  title,
  value,
  inheritedLabel,
  onCancel,
  onSubmit,
}: {
  open: boolean
  title: string
  value: RateValue
  /** у спринта: «40 BYN/ч у А-Лизинг» — что будет, если своей ставки нет */
  inheritedLabel?: string
  onCancel: () => void
  onSubmit: (value: RateValue) => void
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {/* поля монтируются при открытии — сразу с текущим значением, без сброса после первого кадра */}
      <RateFields value={value} inheritedLabel={inheritedLabel} onCancel={onCancel} onSubmit={onSubmit} />
    </Sheet>
  )
}

function RateFields({
  value,
  inheritedLabel,
  onCancel,
  onSubmit,
}: {
  value: RateValue
  inheritedLabel?: string
  onCancel: () => void
  onSubmit: (value: RateValue) => void
}) {
  const [text, setText] = useState(() => (value.hourly_rate != null ? String(value.hourly_rate).replace('.', ',') : ''))
  const [currency, setCurrency] = useState<RateCurrency>(value.rate_currency ?? 'BYN')

  const parsed = text.trim() === '' ? null : Number(text.replace(/\s/g, '').replace(',', '.'))
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000)

  return (
    <>
      <div className="flex gap-2">
        <input
          id="rate-amount"
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Например, 40"
          aria-label="Ставка в час"
          aria-invalid={invalid}
          className={`${fieldClass} tabular flex-1 font-mono`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !invalid) onSubmit({ hourly_rate: parsed, rate_currency: parsed === null ? null : currency })
          }}
        />
        <span className="flex items-center text-base text-text-secondary">в час</span>
      </div>
      <Segmented
        stretch
        value={currency}
        onChange={setCurrency}
        options={RATE_CURRENCIES.map((c) => ({ value: c, label: c }))}
      />
      {invalid && <p className="text-sm text-danger-text">Введите число, например 40 или 37,5</p>}
      {inheritedLabel !== undefined && (
        <div className="flex items-center justify-between gap-3 rounded-sm bg-surface-sunken px-3 py-2.5">
          <span className="min-w-0 text-sm text-text-secondary">
            {inheritedLabel ? `Без своей ставки — ${inheritedLabel}` : 'У клиента ставка не задана'}
          </span>
          {value.hourly_rate != null && (
            <Button variant="ghost" onClick={() => onSubmit({ hourly_rate: null, rate_currency: null })}>
              Как у клиента
            </Button>
          )}
        </div>
      )}
      <SheetActions
        onCancel={onCancel}
        onConfirm={() => onSubmit({ hourly_rate: parsed, rate_currency: parsed === null ? null : currency })}
        confirmDisabled={invalid}
        confirmLabel={parsed === null ? 'Убрать ставку' : `Сохранить · ${formatRate(parsed, currency)}`}
      />
    </>
  )
}
