import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, Logo, PageShell } from '../components/ui.jsx'
import { apiHealth, apiLogin, apiRegister } from '../lib/api.js'

// Этап 4 (ТЗ §6.2): реальные аккаунты email+пароль на бэке. Гостевой режим
// (вход по нику) остаётся для демо и соло — рейтинговые матчи требуют аккаунт.
// OAuth (Google) — бэклог.

const inputCls =
  'mt-2 w-full rounded-lg bg-graphite border border-line px-4 py-3 text-cream placeholder:text-muted/60 focus:outline-none focus:border-accent/60 transition-colors'

export default function Login() {
  const { player, login, loginServer } = usePlayer()
  const navigate = useNavigate()
  const [serverUp, setServerUp] = useState(null) // null = проверяем
  const [tab, setTab] = useState('login') // login | register | guest
  const [nick, setNick] = useState(player?.nick || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ageOk, setAgeOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiHealth()
      .then(() => setServerUp(true))
      .catch(() => {
        setServerUp(false)
        setTab('guest')
      })
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!ageOk) return

    if (tab === 'guest') {
      if (nick.trim().length < 3) return
      login(nick)
      navigate('/camera-check')
      return
    }

    setBusy(true)
    try {
      const data =
        tab === 'register'
          ? await apiRegister(nick.trim(), email.trim(), password)
          : await apiLogin(email.trim(), password)
      loginServer(data)
      navigate('/camera-check')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const valid =
    ageOk &&
    (tab === 'guest'
      ? nick.trim().length >= 3
      : tab === 'register'
        ? nick.trim().length >= 3 && email.includes('@') && password.length >= 6
        : email.includes('@') && password.length > 0)

  return (
    <PageShell>
      <div className="max-w-md mx-auto pt-12 fade-up">
        <div className="text-center mb-10">
          <Logo className="text-3xl" />
          <p className="mt-3 text-sm text-muted">Вход в клуб</p>
        </div>

        <form onSubmit={submit} className="panel p-8 space-y-6">
          {serverUp && (
            <div className="flex gap-1 text-xs">
              {[
                ['login', 'Вход'],
                ['register', 'Регистрация'],
                ['guest', 'Гость'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key)
                    setError(null)
                  }}
                  className={`flex-1 rounded-full px-3 py-2 transition-colors cursor-pointer ${
                    tab === key ? 'hairline text-accent-soft' : 'text-muted hover:text-cream'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {serverUp === false && (
            <p className="text-[11px] text-muted">
              Сервер недоступен — доступен гостевой режим (демо-баттлы и соло). Аккаунты, рейтинг
              и live-матчи появятся при запущенном сервере.
            </p>
          )}

          {(tab === 'register' || tab === 'guest') && (
            <label className="block">
              <span className="text-xs uppercase tracking-[0.2em] text-muted">Никнейм</span>
              <input
                autoFocus
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={20}
                placeholder="Минимум 3 символа"
                className={inputCls}
              />
            </label>
          )}

          {tab !== 'guest' && (
            <>
              <label className="block">
                <span className="text-xs uppercase tracking-[0.2em] text-muted">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-[0.2em] text-muted">Пароль</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={tab === 'register' ? 'Минимум 6 символов' : '••••••'}
                  autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                  className={inputCls}
                />
              </label>
            </>
          )}

          <label className="flex items-start gap-3 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={ageOk}
              onChange={(e) => setAgeOk(e.target.checked)}
              className="mt-1 accent-[#a78bfa]"
            />
            <span>
              Мне есть 18 лет, я принимаю{' '}
              <a href="#/terms" className="text-accent hover:text-accent-soft">условия использования</a> и{' '}
              <a href="#/privacy" className="text-accent hover:text-accent-soft">политику конфиденциальности</a>.
            </span>
          </label>

          {error && <p className="text-xs text-danger">{error}</p>}

          <Button disabled={!valid || busy} className="w-full">
            {busy ? 'Секунду…' : tab === 'register' ? 'Создать аккаунт' : tab === 'guest' ? 'Войти гостем' : 'Войти'}
          </Button>

          <div className="space-y-3 pt-2 border-t border-line">
            <Button variant="ghost" className="w-full opacity-50" disabled title="В бэклоге">
              Продолжить с Google — скоро
            </Button>
            {serverUp && tab === 'guest' && (
              <p className="text-center text-[11px] text-muted">
                Гость может играть демо и соло. Рейтинговые live-матчи — только с аккаунтом.
              </p>
            )}
          </div>
        </form>
      </div>
    </PageShell>
  )
}
