import { usePref } from './prefs'

/**
 * Плотность списка задач на компьютере (0.62). Под мышь строки ниже: «Компактно» — 34 px,
 * на экран входит в полтора раза больше задач. «Обычно» — прежняя высота. Телефона не
 * касается: там строки под палец. Настройка этого устройства, как и тема.
 */
export type Density = 'compact' | 'comfortable'

export const DENSITY_LABEL: Record<Density, string> = {
  compact: 'Компактно',
  comfortable: 'Обычно',
}

const KEY = 'semternity.density'

export function useDensity(): [Density, (next: Density) => void] {
  const [pref, setPref] = usePref<{ value: Density }>(KEY, { value: 'compact' })
  const value: Density = pref.value === 'comfortable' ? 'comfortable' : 'compact'
  return [value, (next) => setPref({ value: next })]
}
