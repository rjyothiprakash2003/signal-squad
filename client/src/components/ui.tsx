import { useEffect, useRef, useState, type ReactNode } from 'react'

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 80 80" aria-hidden="true">
      <rect width="80" height="80" rx="18" fill="#07111F" />
      <path d="M40 14 62.5 27v26L40 66 17.5 53V27L40 14Z" stroke="#3EE0FF" strokeWidth="2.5" fill="none" />
      <path d="M27 46c2.2-9 6.4-13 13-13s10.8 4 13 13" stroke="#4C8DFF" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M32 46c1.3-5 3.6-7.5 8-7.5S46.7 41 48 46" stroke="#4C8DFF" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="40" cy="46" r="3.2" fill="#8B7CFF" />
    </svg>
  )
}

export function Art({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className={`art-fallback ${className ?? ''}`} role="img" aria-label={alt}>
        <LogoMark />
      </div>
    )
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog ref={ref} className="modal" aria-labelledby="confirm-title" onCancel={(event) => { event.preventDefault(); onCancel() }}>
      <h2 id="confirm-title">{title}</h2>
      <p>{body}</p>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className={danger ? 'btn danger' : 'btn'} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  )
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function Countdown({
  deadline,
  serverNow,
  durationMs,
}: {
  deadline: number | null
  serverNow: number
  durationMs: number | null
}) {
  const [now, setNow] = useState(() => Date.now())
  const anchor = useRef({ serverNow, receivedAt: Date.now() })
  const [live, setLive] = useState('')
  const announced = useRef<number | null>(null)
  if (anchor.current.serverNow !== serverNow) anchor.current = { serverNow, receivedAt: Date.now() }
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [])
  const remaining = deadline == null ? null : Math.max(0, deadline - (now + (anchor.current.serverNow - anchor.current.receivedAt)))
  const seconds = remaining == null ? null : Math.ceil(remaining / 1000)
  useEffect(() => {
    if (seconds == null) return
    if (seconds !== 60 && seconds !== 30 && seconds !== 10 && seconds !== 0) return
    if (announced.current === seconds) return
    announced.current = seconds
    setLive(seconds === 0 ? 'Clock at zero. Waiting for mission control.' : `${seconds} seconds remaining.`)
  }, [seconds])
  if (remaining == null) return null
  const urgency = seconds != null && seconds <= 10 ? 'danger' : seconds != null && seconds <= 30 ? 'warn' : 'ok'
  const ratio = durationMs && durationMs > 0 ? Math.max(0, Math.min(1, remaining / durationMs)) : 0
  return (
    <div className={`countdown urgency-${urgency}`} data-testid="countdown" style={{ ['--ratio' as string]: String(ratio) }}>
      <p className="timer-kicker">Time remaining</p>
      <p className="timer-value">{formatClock(remaining)}</p>
      <div className="sr-only" aria-live="polite">{live}</div>
      {seconds === 0 && <p className="timer-note">Holding for mission control…</p>}
    </div>
  )
}

export function Banner({ tone, children }: { tone: 'error' | 'good' | 'info'; children: ReactNode }) {
  return <p className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
}
