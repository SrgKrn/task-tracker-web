/** часовые пояса для выбора в настройках; старые браузеры — хотя бы текущий и Минск */
export function timeZoneOptions(current: string): string[] {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone
  let all: string[] = []
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    all = []
  }
  return [...new Set([current, device, 'Europe/Minsk', ...all])].filter(Boolean)
}
