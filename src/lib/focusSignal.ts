import { tap } from './haptics'

let ctx: AudioContext | null = null

/**
 * Сигнал конца отрезка: два мягких тона и вибрация. Звук создаётся синтезом — файл со
 * звуком не нужно качать и класть в кэш приложения. Браузер разрешает звук только после
 * касания страницы; если не разрешил — останется вибрация и уведомление на экране.
 */
export function playFocusSignal(kind: 'work-done' | 'break-done') {
  tap([180, 90, 180])
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const notes = kind === 'work-done' ? [880, 660] : [660, 880]
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      const start = ctx!.currentTime + i * 0.28
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(start)
      osc.stop(start + 0.55)
    })
  } catch {
    // звук — дополнение к уведомлению, без него всё работает
  }
}
