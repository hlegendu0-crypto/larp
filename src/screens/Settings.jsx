import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../store.jsx'
import { Button, PageShell } from '../components/ui.jsx'
import { getAiConfig, setAiConfig, MODELS } from '../lib/vision.js'

export default function Settings() {
  const { player, rename, logout } = usePlayer()
  const navigate = useNavigate()
  const [nick, setNick] = useState(player.nick)
  const [saved, setSaved] = useState(false)
  const [devices, setDevices] = useState({ cams: [], mics: [] })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [ai, setAi] = useState(() => getAiConfig())
  const [aiSaved, setAiSaved] = useState(false)

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((list) =>
        setDevices({
          cams: list.filter((d) => d.kind === 'videoinput'),
          mics: list.filter((d) => d.kind === 'audioinput'),
        }),
      )
      .catch(() => {})
  }, [])

  const save = () => {
    if (nick.trim().length < 3) return
    rename(nick)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const Select = ({ label, items }) => (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{label}</span>
      <select className="mt-2 w-full rounded-lg bg-graphite border border-line px-4 py-3 text-cream focus:outline-none focus:border-accent/60">
        {items.length === 0 && <option>По умолчанию</option>}
        {items.map((d, i) => (
          <option key={d.deviceId || i}>{d.label || `Устройство ${i + 1}`}</option>
        ))}
      </select>
    </label>
  )

  return (
    <PageShell>
      <div className="fade-up pt-4 max-w-lg">
        <h1 className="font-display text-3xl mb-8">Настройки</h1>

        <div className="panel p-6 space-y-5 mb-5">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Профиль</div>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-muted">Никнейм</span>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={20}
              className="mt-2 w-full rounded-lg bg-graphite border border-line px-4 py-3 text-cream focus:outline-none focus:border-accent/60"
            />
          </label>
          <Button onClick={save} disabled={nick.trim().length < 3} className="!py-2 text-xs">
            {saved ? 'Сохранено' : 'Сохранить'}
          </Button>
        </div>

        <div className="panel p-6 space-y-5 mb-5">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Устройства</div>
          <Select label="Камера" items={devices.cams} />
          <Select label="Микрофон" items={devices.mics} />
          <p className="text-[11px] text-muted">Выбор устройства применяется на Camera Check.</p>
        </div>

        <div className="panel p-6 space-y-5 mb-5">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">AI-оценка (этап 2)</div>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-muted">Anthropic API key</span>
            <input
              type="password"
              value={ai.apiKey}
              onChange={(e) => setAi((a) => ({ ...a, apiKey: e.target.value }))}
              placeholder="sk-ant-…"
              autoComplete="off"
              className="mt-2 w-full rounded-lg bg-graphite border border-line px-4 py-3 text-cream placeholder:text-muted/60 focus:outline-none focus:border-accent/60"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-muted">Модель</span>
            <select
              value={ai.model}
              onChange={(e) => setAi((a) => ({ ...a, model: e.target.value }))}
              className="mt-2 w-full rounded-lg bg-graphite border border-line px-4 py-3 text-cream focus:outline-none focus:border-accent/60"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.hint}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="!py-2 text-xs"
            onClick={() => {
              setAiConfig(ai)
              setAiSaved(true)
              setTimeout(() => setAiSaved(false), 2000)
            }}
          >
            {aiSaved ? 'Сохранено' : 'Сохранить'}
          </Button>
          <p className="text-[11px] text-muted">
            Ключ хранится только в этом браузере (localStorage) и уходит напрямую в Anthropic API.
            Используется в режиме «Оцени мой флекс».
          </p>
        </div>

        <div className="panel p-6 space-y-4 border-danger/30">
          <div className="text-xs uppercase tracking-[0.2em] text-danger">Опасная зона</div>
          <div className="flex gap-3">
            <Button variant="ghost" className="!py-2 text-xs" onClick={() => { logout(); navigate('/') }}>
              Выйти из аккаунта
            </Button>
            <Button variant="danger" className="!py-2 text-xs" onClick={() => setConfirmDelete(true)}>
              Удалить аккаунт
            </Button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-6">
          <div className="panel p-8 max-w-sm text-center card-in">
            <div className="font-display text-xl mb-2">Удалить аккаунт?</div>
            <p className="text-sm text-muted mb-6">Прогресс, ELO и история будут стёрты безвозвратно.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Отмена</Button>
              <Button variant="danger" onClick={() => { logout(); navigate('/') }}>Удалить</Button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
