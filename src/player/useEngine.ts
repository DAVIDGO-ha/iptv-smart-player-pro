import { useEffect, useRef, useState } from 'react'
import { attachEngine, detectType, type Engine } from '../lib/engines'
import { attachTranscode, canTranscode, needsTranscode, probe } from '../lib/transcode'

// Attach the right engine to a <video>, with automatic fallback between formats.
export function useEngine(videoRef: React.RefObject<HTMLVideoElement>, url: string | undefined, live: boolean) {
  const [error, setError] = useState('')
  const [engine, setEngine] = useState<Engine | null>(null)
  const [tracksTick, setTick] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [noAudio, setNoAudio] = useState(false)
  const [noVideo, setNoVideo] = useState(false)
  const engRef = useRef<Engine | null>(null)
  // Live TV: reconnect by itself when the stream drops or freezes (counts per channel; a manual Retry resets it)
  const auto = useRef({ url: '', n: 0, played: false })
  // Laptop app: Dolby / DTS sound → ffmpeg converts the sound so the built-in player has sound
  const [txFor, setTxFor] = useState('')

  useEffect(() => {
    const v = videoRef.current
    if (!v || !url) return
    let dead = false
    if (auto.current.url !== url) auto.current = { url: url, n: 0, played: false }
    const A = auto.current
    let again: any
    // true = a reconnect is on its way (keep the spinner, no error box)
    const reconnect = () => {
      if (!live || dead || txOn) return false
      if (A.n >= (A.played ? 6 : 1)) return false
      A.n++
      clearTimeout(again)
      again = setTimeout(() => !dead && setAttempt((a) => a + 1), Math.min(1000 * A.n, 4000))
      return true
    }
    setError('')
    setNoAudio(false)
    setNoVideo(false)
    // Playing but no sound decoded → Dolby/DTS sound; sound but no picture → HEVC/H.265 or a format the
    // device's web engine can't show (old Firesticks). Both play fine in the Pro player.
    let aBad = 0
    let vBad = 0
    let ticks = 0
    const tx = canTranscode()
    let txOn = false
    // Freeze watchdog: picture stuck for 10 s (20 s while first loading) → reconnect
    let lastT = -1
    let stuck = 0
    let good = 0
    const watchdog = live
      ? setInterval(() => {
          if (dead || v.paused || document.hidden) return void (stuck = 0)
          if (v.currentTime !== lastT) {
            lastT = v.currentTime
            stuck = 0
            if (v.currentTime > 2) A.played = true
            if (++good >= 15) A.n = 0 // 30 s of smooth playback → full set of reconnects again
            return
          }
          good = 0
          if (++stuck < (A.played ? 5 : 10)) return
          stuck = 0
          if (!reconnect()) {
            engRef.current?.destroy()
            engRef.current = null
            setError('The stream stopped. Check your internet connection, then press Retry.')
          }
        }, 2000)
      : null
    const audioCheck = setInterval(() => {
      if (v.paused || v.currentTime < 2) return
      if (++ticks > 6) return clearInterval(audioCheck)
      const dec = (v as any).webkitAudioDecodedByteCount
      const vdec = (v as any).webkitVideoDecodedByteCount
      if (dec === 0 && ++aBad === 2 && !dead) {
        if (tx && !txOn) return clearInterval(audioCheck), setTxFor(url)
        setNoAudio(true)
      }
      if ((v.videoWidth === 0 || vdec === 0) && ++vBad === 2 && !dead) {
        if (tx && !txOn) return clearInterval(audioCheck), setTxFor(url)
        setNoVideo(true)
      }
    }, 2500)
    const first = detectType(url, live ? 'live' : undefined)
    // Fallback order per first guess
    const order: { u: string; t: 'hls' | 'ts' | 'native' }[] = [{ u: url, t: first }]
    if (live && /\.ts(\?|$)/.test(url)) order.push({ u: url.replace(/\.ts(\?|$)/, '.m3u8$1'), t: 'hls' })
    if (live && /\.m3u8(\?|$)/.test(url)) order.push({ u: url.replace(/\.m3u8(\?|$)/, '.ts$1'), t: 'ts' })
    if (first === 'native') order.push({ u: url, t: 'hls' })
    if (first !== 'native') order.push({ u: url, t: 'native' })

    let step = 0
    const tryNext = async (why?: string) => {
      engRef.current?.destroy()
      engRef.current = null
      if (dead) return
      const o = order[step++]
      if (!o) {
        if (reconnect()) return
        setError(why || 'This stream could not be played.')
        return
      }
      try {
        const e = await attachEngine(v, o.u, {
          live,
          type: o.t,
          onFatal: (m) => !dead && tryNext(m),
          onTracks: () => setTick((x) => x + 1),
        })
        if (dead) return e.destroy()
        engRef.current = e
        setEngine(e)
        v.play().catch(() => {
          /* autoplay may need a tap */
        })
      } catch (err: any) {
        tryNext(err?.message)
      }
    }
    const onErr = () => {
      const code = v.error?.code
      if (!v.getAttribute('src') && !engRef.current) return
      tryNext(code === 4 ? 'This format is not supported on this device. Try the Pro player button.' : 'Playback error.')
    }
    v.addEventListener('error', onErr)
    const onMeta = () => setTick((x) => x + 1)
    v.addEventListener('loadedmetadata', onMeta)
    const start = async () => {
      if (tx) {
        const info = txFor === url ? await probe(url) : live ? null : await probe(url)
        if (dead) return
        if (txFor === url || needsTranscode(info)) {
          try {
            txOn = true
            const e = await attachTranscode(v, url, live, info)
            if (dead) return e.destroy()
            engRef.current = e
            setEngine(e)
            v.play().catch(() => {})
            return
          } catch {
            /* no ffmpeg → normal engine; a later no-sound check shows the Pro player button */
          }
        }
      }
      tryNext()
    }
    start()
    return () => {
      dead = true
      clearInterval(audioCheck)
      if (watchdog) clearInterval(watchdog)
      clearTimeout(again)
      v.removeEventListener('error', onErr)
      v.removeEventListener('loadedmetadata', onMeta)
      engRef.current?.destroy()
      engRef.current = null
      setEngine(null)
    }
  }, [url, live, attempt, txFor])

  return { engine, error, tracksTick, noAudio, noVideo, retry: () => ((auto.current.n = 0), setAttempt((a) => a + 1)) }
}
