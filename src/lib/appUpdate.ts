/**
 * Доставка новых версий. Воркер собран в режиме autoUpdate: скачанная версия сразу
 * становится активной, но открытая страница продолжает работать на старом коде.
 * Сам браузер ищет обновление только при запуске, а iPhone установленное приложение
 * не перезапускает — лишь будит. Поэтому:
 *  • проверяем обновление при каждом возвращении в приложение и раз в 30 минут;
 *  • когда новая версия взяла управление — перезагружаем страницу, но не посреди ввода
 *    и не поверх открытого окна: ждём, пока освободится или приложение свернут.
 */
const CHECK_EVERY_MS = 30 * 60 * 1000
/** чаще раза в минуту не проверяем — переключение между приложениями бывает частым */
const MIN_GAP_MS = 60 * 1000

/** время сборки — показываем в настройках, чтобы было видно, какая версия открыта */
export const BUILD_TIME: string = __BUILD_TIME__

function busy(): boolean {
  const el = document.activeElement as HTMLElement | null
  const typing =
    !!el &&
    (el.tagName === 'TEXTAREA' ||
      el.isContentEditable ||
      (el.tagName === 'INPUT' &&
        !['checkbox', 'radio', 'button', 'submit', 'range'].includes((el as HTMLInputElement).type)))
  return typing || !!document.querySelector('[role="dialog"]')
}

function reloadWhenIdle() {
  const attempt = () => {
    if (document.visibilityState === 'visible' && busy()) return false
    window.location.reload()
    return true
  }
  if (attempt()) return
  const timer = window.setInterval(() => {
    if (attempt()) window.clearInterval(timer)
  }, 2000)
  document.addEventListener('visibilitychange', () => {
    if (attempt()) window.clearInterval(timer)
  })
}

export function startUpdateWatcher() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  // первая установка воркера — не обновление: страница и так свежая
  let controller = navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controller) {
      controller = navigator.serviceWorker.controller
      return
    }
    if (reloading) return
    reloading = true
    reloadWhenIdle()
  })

  let lastCheck = Date.now()
  navigator.serviceWorker.ready
    .then((reg) => {
      const check = () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < MIN_GAP_MS) return
        lastCheck = Date.now()
        reg.update().catch(() => {
          // нет сети — проверим в следующий раз
        })
      }
      document.addEventListener('visibilitychange', check)
      window.setInterval(check, CHECK_EVERY_MS)
    })
    .catch(() => {
      // без воркера обновления приходят при каждом открытии сами
    })
}
