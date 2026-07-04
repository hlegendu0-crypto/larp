import { useCallback, useEffect, useState } from 'react'
import { Button, PageShell } from '../components/ui.jsx'
import { adminBan, adminPlayers, adminReports, adminResolve } from '../lib/api.js'

// Этап 4 (ТЗ §4): админ-панель модератора — очередь жалоб и баны.
// Доступ по ключу администратора (ADMIN_KEY на сервере), страница вне навигации: /#/admin

export default function Admin() {
  const [key, setKey] = useState(() => sessionStorage.getItem('larpbattle.adminkey') || '')
  const [authed, setAuthed] = useState(false)
  const [reports, setReports] = useState([])
  const [players, setPlayers] = useState([])
  const [error, setError] = useState(null)

  const refresh = useCallback(async (k) => {
    const [r, p] = await Promise.all([adminReports(k), adminPlayers(k)])
    setReports(r.reports)
    setPlayers(p.players)
  }, [])

  const enter = async (e) => {
    e?.preventDefault()
    setError(null)
    try {
      await refresh(key)
      sessionStorage.setItem('larpbattle.adminkey', key)
      setAuthed(true)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    if (key) enter()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleBan = async (p) => {
    await adminBan(key, p.nick, !p.banned, p.banned ? null : 'решение модератора')
    refresh(key)
  }
  const resolve = async (id) => {
    await adminResolve(key, id)
    refresh(key)
  }

  if (!authed) {
    return (
      <PageShell>
        <form onSubmit={enter} className="fade-up pt-16 max-w-sm mx-auto panel p-8 space-y-5">
          <h1 className="font-display text-2xl">Модерация</h1>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-muted">Ключ администратора</span>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="mt-2 w-full rounded-lg bg-graphite border border-line px-4 py-3 text-cream focus:outline-none focus:border-accent/60"
            />
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button disabled={!key} className="w-full">Войти</Button>
        </form>
      </PageShell>
    )
  }

  const open = reports.filter((r) => r.status === 'open')
  const resolved = reports.filter((r) => r.status !== 'open')

  return (
    <PageShell wide>
      <div className="fade-up pt-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl">Модерация</h1>
          <Button variant="ghost" className="!py-2 text-xs" onClick={() => refresh(key)}>Обновить</Button>
        </div>

        <h2 className="text-xs uppercase tracking-[0.2em] text-muted mb-3">
          Жалобы — открытые ({open.length})
        </h2>
        <div className="panel divide-y divide-line mb-8">
          {open.length === 0 && <div className="px-5 py-6 text-sm text-muted">Очередь пуста</div>}
          {open.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-4 text-sm">
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{r.reporter}</span>
                <span className="text-muted"> → </span>
                <span className="font-semibold text-danger">{r.reported}</span>
                <span className="block text-[11px] text-muted">
                  {r.created_at} · комната {r.room || '—'} {r.reason ? `· ${r.reason}` : ''}
                </span>
              </span>
              <Button
                variant="danger"
                className="!px-3 !py-1.5 text-xs"
                onClick={() => adminBan(key, r.reported, true, `жалоба #${r.id}`).then(() => refresh(key))}
              >
                Бан
              </Button>
              <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => resolve(r.id)}>
                Закрыть
              </Button>
            </div>
          ))}
        </div>

        <h2 className="text-xs uppercase tracking-[0.2em] text-muted mb-3">Игроки ({players.length})</h2>
        <div className="panel divide-y divide-line mb-8">
          {players.map((p) => (
            <div key={p.nick} className="flex items-center gap-4 px-5 py-3.5 text-sm">
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{p.nick}</span>
                <span className="ml-2 text-[11px] text-muted">{p.email}</span>
                {!!p.banned && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-danger">
                    бан{p.ban_reason ? `: ${p.ban_reason}` : ''}
                  </span>
                )}
              </span>
              <span className="font-display text-accent-soft w-14 text-right">{p.elo}</span>
              <span className="text-muted w-16 text-right">{p.wins}–{p.losses}</span>
              <Button
                variant={p.banned ? 'ghost' : 'danger'}
                className="!px-3 !py-1.5 text-xs w-24"
                onClick={() => toggleBan(p)}
              >
                {p.banned ? 'Разбан' : 'Бан'}
              </Button>
            </div>
          ))}
        </div>

        {resolved.length > 0 && (
          <>
            <h2 className="text-xs uppercase tracking-[0.2em] text-muted mb-3">
              Закрытые жалобы ({resolved.length})
            </h2>
            <div className="panel divide-y divide-line opacity-60">
              {resolved.map((r) => (
                <div key={r.id} className="px-5 py-3 text-xs text-muted">
                  #{r.id} · {r.reporter} → {r.reported} · {r.created_at}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
