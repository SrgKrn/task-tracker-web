/*
 * Шрифты дизайн-системы собираются вместе с приложением, а не грузятся с Google Fonts:
 * PWA должно открываться без сети, и сервис-воркер кэширует их как обычные файлы сборки.
 * Только латиница и кириллица и только нужные начертания — Onest 400/500/600,
 * JetBrains Mono 400/500 (700 система не использует).
 */
import '@fontsource/onest/latin-400.css'
import '@fontsource/onest/latin-500.css'
import '@fontsource/onest/latin-600.css'
import '@fontsource/onest/cyrillic-400.css'
import '@fontsource/onest/cyrillic-500.css'
import '@fontsource/onest/cyrillic-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/cyrillic-400.css'
import '@fontsource/jetbrains-mono/cyrillic-500.css'
