import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'larpbattle.player.v1'
const PlayerContext = createContext(null)

const freshPlayer = (nick) => ({
  nick,
  elo: 1000,
  wins: 0,
  losses: 0,
  history: [], // { opponent, myScore, oppScore, delta, won, technical, date }
  bestItem: null, // { name, price }
})

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (player) localStorage.setItem(KEY, JSON.stringify(player))
    else localStorage.removeItem(KEY)
  }, [player])

  const login = (nick) => setPlayer(freshPlayer(nick.trim()))
  const logout = () => setPlayer(null)
  const rename = (nick) => setPlayer((p) => ({ ...p, nick: nick.trim() }))

  const applyResult = (r) => {
    setPlayer((p) => {
      if (!p) return p
      const best =
        r.myBestItem && (!p.bestItem || r.myBestItem.price > p.bestItem.price)
          ? r.myBestItem
          : p.bestItem
      return {
        ...p,
        elo: Math.max(0, p.elo + r.delta),
        wins: p.wins + (r.won ? 1 : 0),
        losses: p.losses + (r.won ? 0 : 1),
        history: [
          {
            opponent: r.opponent,
            myScore: r.myScore,
            oppScore: r.oppScore,
            delta: r.delta,
            won: r.won,
            technical: r.technical || false,
            date: new Date().toISOString(),
          },
          ...p.history,
        ].slice(0, 20),
        bestItem: best,
      }
    })
  }

  return (
    <PlayerContext.Provider value={{ player, login, logout, rename, applyResult }}>
      {children}
    </PlayerContext.Provider>
  )
}

export const usePlayer = () => useContext(PlayerContext)
