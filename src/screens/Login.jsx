import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, Logo, PageShell } from '../components/ui.jsx'

// Этап 1 — заглушка авторизации: вход по нику без пароля (ТЗ §6.2).
// Целевое: email + пароль, OAuth (Google).
export default function Login() {
  const { player, login } = usePlayer()
  const navigate = useNavigate()
  const [nick, setNick] = useState(player?.nick || '')
  const [ageOk, setAgeOk] = useState(false)
  const valid = nick.trim().length >= 3 && ageOk

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    login(nick)
    navigate('/camera-check')
  }

  return (
    <PageShell>
      <div className="max-w-md mx-auto pt-12 fade-up">
        <div className="text-center mb-10">
          <Logo className="text-3xl" />
          <p className="mt-3 text-sm text-muted">Вход в клуб</p>
        </div>
        <form onSubmit={submit} className="panel p-8 space-y-6">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-muted">Никнейм</span>
            <input
              autoFocus
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              placeholder="Минимум 3 символа"
              className="mt-2 w-full rounded-lg bg-graphite border border-line px-4 py-3 text-cream placeholder:text-muted/60 focus:outline-none focus:border-gold/60 transition-colors"
            />
          </label>
          <label className="flex items-start gap-3 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={ageOk}
              onChange={(e) => setAgeOk(e.target.checked)}
              className="mt-1 accent-[#d4b46a]"
            />
            <span>
              Мне есть 18 лет, я принимаю{' '}
              <a href="#/terms" className="text-gold hover:text-champagne">условия использования</a> и{' '}
              <a href="#/privacy" className="text-gold hover:text-champagne">политику конфиденциальности</a>.
            </span>
          </label>
          <Button disabled={!valid} className="w-full">Войти</Button>
          <div className="space-y-3 pt-2 border-t border-line">
            <Button variant="ghost" className="w-full opacity-50" disabled title="Доступно на этапе 4">
              Продолжить с Google — скоро
            </Button>
            <p className="text-center text-[11px] text-muted">
              Этап 1: вход по нику. Email и OAuth появятся с реальным бэкендом.
            </p>
          </div>
        </form>
      </div>
    </PageShell>
  )
}
