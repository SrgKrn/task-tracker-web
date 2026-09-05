/**
 * Короткая вибрация на значимых действиях (старт/стоп учёта).
 * iOS Safari Vibration API не поддерживает — там это простоно-оп, без ошибок.
 */
export function tap(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // вибрация — украшение, её отказ никогда не должен ломать действие
  }
}
