/**
 * Свой логотип в отчёте (0.41, «Про»). Картинка уменьшается в браузере до размера шапки
 * и хранится PNG прямо в настройках (data URL): так она попадает и в PDF, и в снимок
 * отчёта по ссылке, который клиент открывает без входа.
 */

/** рамка логотипа в пикселях: в шапке PDF он ~16 pt высотой, запас — для чёткости */
export const LOGO_BOX = { w: 600, h: 200 }
/** база принимает до 400 000 знаков; держим запас */
export const LOGO_MAX_CHARS = 350_000

/** Размер, в который картинка w×h вписывается в рамку, не увеличиваясь. */
export function fitBox(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 }
  const k = Math.min(1, maxW / w, maxH / h)
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Файл картинки → PNG data URL в рамке LOGO_BOX; если тяжело — рамка поменьше. */
export async function prepareLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Не получилось открыть картинку — попробуйте PNG или JPG'))
      el.src = url
    })
    for (const scale of [1, 0.66, 0.45]) {
      const size = fitBox(img.naturalWidth, img.naturalHeight, LOGO_BOX.w * scale, LOGO_BOX.h * scale)
      const canvas = document.createElement('canvas')
      canvas.width = size.w
      canvas.height = size.h
      canvas.getContext('2d')!.drawImage(img, 0, 0, size.w, size.h)
      const data = canvas.toDataURL('image/png')
      if (data.length <= LOGO_MAX_CHARS) return data
    }
    throw new Error('Логотип слишком детальный — упростите картинку или сохраните её меньшего размера')
  } finally {
    URL.revokeObjectURL(url)
  }
}
