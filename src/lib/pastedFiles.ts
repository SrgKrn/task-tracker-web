/**
 * Вставленный из буфера снимок экрана приходит безымянным («image.png»): в списке файлов
 * такие не отличить. Даём имя по времени вставки (0.65); у настоящих файлов имя не трогаем.
 */
export function pastedName(name: string, type: string, at: Date): string {
  if (name && !/^image\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return name
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? type.split('/')[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg')
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`
  return `Снимок ${stamp}.${ext}`
}

/** снимки — с понятным именем; остальное как есть */
export function namePastedFiles(files: File[], at = new Date()): File[] {
  return files.map((f) => {
    const name = pastedName(f.name, f.type, at)
    return name === f.name ? f : new File([f], name, { type: f.type, lastModified: f.lastModified })
  })
}
