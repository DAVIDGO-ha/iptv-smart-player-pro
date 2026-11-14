import React, { useEffect, useMemo } from 'react'
import { useApp } from '../store'
import { Empty, Icon, Img, Spinner } from '../ui'
import { ChannelRow, Poster, Rail, playLive } from './common'
import { SPORT_RE } from './Live'
import { licenseInfo } from '../lib/cloud'
import type { Item } from '../lib/types'

// Not films: sports replays, music, 24/7 channels… (kept out of the home movie rows)
const NOT_FILM = /\b(replay|highlights?|match|race|grand prix|concert|music|radio|24\/7|live events?|wrestling)\b/i

export function Loading() {
  const app = useApp()
  return (
    <div className="center-fill">
      <Spinner size={44} />
      <div className="muted">{app.loading}</div>
    </div>
  )
}

export function ErrorState() {
  const app = useApp()
  return (
    <Empty
      icon="info"
      title="Couldn’t load your playlist"
      text={app.error}
      action={
        <div className="row gap">
          <button className="btn primary" onClick={() => app.load(app.active, true)} data-autofocus>
            <Icon n="refresh" s={18} /> Try Again
          </button>
          <button className="btn" onClick={() => app.nav.push('settings')}>
            Settings
          </button>
          <button className="btn" onClick={() => app.nav.push('playlists')}>
            Playlists
          </button>
        </div>
      }
    />
  )
}

export function Home() {
  const app = useApp()
  const live = app.visible('live')
  const movies = app.visible('movie')
  const series = app.visible('series')

  // Big panels: load one real movie / series category for the home rows
  const pickCat = (cats: typeof movies.cats) => {
    const ok = cats.filter((x) => !app.isLocked(x) && !x.adult && !SPORT_RE.test(x.name) && !NOT_FILM.test(x.name))
    const year = new Date().getFullYear()
    const fresh = new RegExp(`\\b(new|latest|recent|recently added|just added|neu|nouveaut|novedad|${year}|${year - 1})\\b`, 'i')
    return ok.find((x) => fresh.test(x.name)) || ok.find((x) => /movie|film|cinema|kino|vod|action|box ?office|blockbuster/i.test(x.name)) || ok[0] || cats.find((x) => !app.isLocked(x))
  }
  useEffect(() => {
    if (movies.lazy && !movies.items.length) {
      const c = pickCat(movies.cats)
      if (c) app.loadCat('movie', c.id)
    }
    if (series.lazy && !series.items.length) {
      const c = pickCat(series.cats)
      if (c) app.loadCat('series', c.id)
    }
  }, [movies.lazy, series.lazy])

  const byId = useMemo(() => {
    const m: Record<string, Item> = {}
    live.items.forEach((i) => (m[i.id] = i))
    return m
  }, [live])

  const hist = Object.values(app.history).sort((a, b) => b.at - a.at)
  const cont = hist.filter((h) => h.kind !== 'live' && h.dur && h.pos && h.pos / h.dur < 0.95)
  const recentLive = hist.filter((h) => h.kind === 'live').map((h) => byId[h.id]).filter(Boolean).slice(0, 14)
  const favLive = app.favs.live.map((id) => byId[id]).filter(Boolean)
  const sportCats = useMemo(() => new Set(movies.cats.filter((c) => SPORT_RE.test(c.name) || NOT_FILM.test(c.name)).map((c) => c.id)), [movies.cats])
  const realMovies = useMemo(() => {
    const r = movies.items.filter((m) => !sportCats.has(m.categoryId) && !SPORT_RE.test(m.name))
    return r.length ? r : movies.items
  }, [movies, sportCats])
  const newMovies = useMemo(() => [...realMovies].sort((a, b) => (b.added || 0) - (a.added || 0)).slice(0, 24), [realMovies])
  const newSeries = useMemo(() => [...series.items].sort((a, b) => (b.added || 0) - (a.added || 0)).slice(0, 24), [series])
  // Featured: the best-rated recent movie that has a picture (same one all day, not random on every visit)
  const hero = useMemo(() => {
    const pool = newMovies.filter((m) => m.logo)
    if (!pool.length) return undefined
    const best = [...pool].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6)
    return best[new Date().getDate() % best.length]
  }, [newMovies])

  const acc = app.catalog?.account?.user_info
  const lic = licenseInfo()
  const sportsCount = useMemo(() => {
    const ids = new Set(live.cats.filter((c) => SPORT_RE.test(c.name)).map((c) => c.id))
    return live.items.filter((i) => ids.has(i.categoryId)).length
  }, [live])
  const count = (sec: typeof movies, one: string) => (sec.lazy ? `${sec.cats.length} categories` : `${sec.items.length.toLocaleString()} ${one}`)
  const resume = (h: (typeof hist)[0]) => {
    if (h.kind === 'movie') app.nav.push('movie', { id: h.id })
    else app.nav.push('series', { id: h.seriesId, resume: h.id })
  }
  const empty = !live.items.length && !movies.cats.length && !movies.items.length && !series.cats.length && !series.items.length

  const quick: { id: string; label: string; sub: string; icon: string; go: () => void }[] = [
    { id: 'live', label: 'Live TV', sub: `${live.items.length.toLocaleString()} channels`, icon: 'live', go: () => app.nav.tab('live') },
    { id: 'movies', label: 'Movies', sub: count(movies, 'titles'), icon: 'movie', go: () => app.nav.tab('movies') },
    { id: 'series', label: 'Series', sub: count(series, 'shows'), icon: 'series', go: () => app.nav.tab('series') },
    { id: 'guide', label: 'TV Guide', sub: 'Now and next', icon: 'guide', go: () => app.nav.tab('guide') },
    { id: 'sports', label: 'Sports', sub: `${sportsCount.toLocaleString()} channels`, icon: 'star', go: () => app.nav.tab('sports') },
    { id: 'multiview', label: 'Multi-View', sub: 'Up to 4 screens', icon: 'grid', go: () => app.nav.tab('multiview') },
  ]
  const licence = lic.state === 'lifetime' ? 'Lifetime licence' : lic.state === 'trial' ? `Free trial · ${lic.days} day${lic.days === 1 ? '' : 's'} left` : lic.state === 'active' ? `Licence · ${lic.days} days left` : ''

  return (
    <div className="page home2">
      <div className="home2-top">
        {hero ? (
          <button className="hero-card" onClick={() => app.nav.push('movie', { id: hero.id, item: hero })} data-autofocus>
            <Img src={hero.logo} alt="" className="hero-bg" />
            <Img src={hero.logo} alt={hero.name} className="hero-poster" />
            <span className="hero-info">
              <span className="hero-tag">Featured tonight</span>
              <span className="hero-name">{hero.name}</span>
              <span className="hero-meta">
                {!!hero.rating && (
                  <span className="rating-inline">
                    <Icon n="star" s={13} fill /> {hero.rating.toFixed(1)}
                  </span>
                )}
                {hero.year && <span>{hero.year}</span>}
              </span>
              <span className="hero-play">
                <Icon n="play" fill s={16} /> Watch now
              </span>
            </span>
          </button>
        ) : (
          <button className="hero-card plain" onClick={() => app.nav.tab('live')} data-autofocus>
            <span className="hero-info">
              <span className="hero-tag">Welcome</span>
              <span className="hero-name">Your TV, ready when you are</span>
              <span className="hero-play">
                <Icon n="play" fill s={16} /> Open Live TV
              </span>
            </span>
          </button>
        )}
        <div className="quick">
          {quick.map((q) => (
            <button key={q.id} className={'quick-pill q-' + q.id} onClick={q.go}>
              <span className="q-icon">
                <Icon n={q.icon} s={22} />
              </span>
              <span className="q-text">
                <b>{q.label}</b>
                <small>{q.sub}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {cont.length > 0 && (
        <Rail title="Continue watching" action={<button className="link" onClick={() => app.nav.tab('history')}>See all</button>}>
          {cont.slice(0, 20).map((h) => (
            <button key={h.key} className="wide-card" onClick={() => resume(h)}>
              <div className="wide-img">
                <Img src={h.image} alt={h.name} className="cover" />
                <div className="pbar">
                  <i style={{ width: ((h.pos || 0) / (h.dur || 1)) * 100 + '%' }} />
                </div>
                <span className="play-badge">
                  <Icon n="play" fill s={16} />
                </span>
              </div>
              <div className="poster-name ellip">{h.seriesName || h.name}</div>
              <div className="poster-meta ellip">{h.kind === 'episode' ? `S${h.season} · E${h.episode}` : `${Math.round((h.dur! - h.pos!) / 60)} min left`}</div>
            </button>
          ))}
        </Rail>
      )}

      {(favLive.length > 0 || recentLive.length > 0) && (
        <Rail title={favLive.length ? 'Favorite channels' : 'Recent channels'} action={<button className="link" onClick={() => app.nav.tab('live')}>All channels</button>}>
          {(favLive.length ? favLive : recentLive).map((c, _, arr) => (
            <button key={c.id} className="ch-tile" onClick={() => playLive(app, c, arr)}>
              <Img className="ch-tile-logo" src={c.logo} alt={c.name} />
              <span className="ellip small">{c.name}</span>
            </button>
          ))}
        </Rail>
      )}

      {newMovies.length > 0 && (
        <Rail title="Recent movies" action={<button className="link" onClick={() => app.nav.tab('movies')}>See all</button>}>
          {newMovies.map((m) => (
            <Poster key={m.id} item={m} onClick={() => app.nav.push('movie', { id: m.id, item: m })} />
          ))}
        </Rail>
      )}
      {newSeries.length > 0 && (
        <Rail title="Recent series" action={<button className="link" onClick={() => app.nav.tab('series')}>See all</button>}>
          {newSeries.map((m) => (
            <Poster key={m.id} item={m} onClick={() => app.nav.push('series', { id: m.id, item: m })} />
          ))}
        </Rail>
      )}

      <div className="home2-foot">
        <span className="ellip">
          <Icon n="list" s={15} /> {app.active?.name || 'Playlist'}
        </span>
        {acc?.exp_date && <span>Subscription ends {new Date(Number(acc.exp_date) * 1000).toLocaleDateString()}</span>}
        {licence && <span>{licence}</span>}
        <button className="link" onClick={() => app.nav.tab('playlists')}>
          Change playlist
        </button>
      </div>
      {empty && <Empty icon="tv" title="This playlist is empty" text="Your provider returned no channels, movies or series." />}
    </div>
  )
}

export { ChannelRow }
