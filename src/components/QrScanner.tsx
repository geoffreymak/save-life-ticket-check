import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { CameraOff, SwitchCamera } from 'lucide-react'

interface Props {
  /** Appelé à chaque décodage réussi. Le scanner se met en pause ensuite. */
  onResult: (text: string) => void
  /** Quand true, le scanner reprend la lecture. */
  active: boolean
  /** Agrandit la zone vidéo et la mire pour le mode plein écran. */
  fullscreen?: boolean
  className?: string
}

export function QrScanner({
  onResult,
  active,
  fullscreen = false,
  className = '',
}: Props) {
  const reactId = useId()
  const regionId = useMemo(
    () => `qr-reader-region-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [reactId],
  )
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const onResultRef = useRef(onResult)
  const lastDecodeRef = useRef<{ text: string; at: number }>({
    text: '',
    at: 0,
  })
  const [error, setError] = useState('')
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [camIndex, setCamIndex] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  // Initialisation : liste des caméras + démarrage.
  useEffect(() => {
    let cancelled = false
    const scanner = new Html5Qrcode(regionId, { verbose: false })
    scannerRef.current = scanner

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return
        if (!devices || devices.length === 0) {
          setError('Aucune caméra détectée sur cet appareil.')
          return
        }
        setCameras(devices.map((d) => ({ id: d.id, label: d.label })))
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            'Accès caméra refusé. Autorisez la caméra puis rechargez la page.',
          )
        }
      })

    return () => {
      cancelled = true
      const s = scannerRef.current
      scannerRef.current = null
      if (!s) return
      const state = s.getState()
      if (
        state === Html5QrcodeScannerState.SCANNING ||
        state === Html5QrcodeScannerState.PAUSED
      ) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {})
      } else {
        try {
          s.clear()
        } catch {
          /* ignore */
        }
      }
    }
  }, [regionId])

  // Démarre la caméra sélectionnée.
  useEffect(() => {
    const scanner = scannerRef.current
    if (!scanner || cameras.length === 0) return
    const camId = cameras[camIndex]?.id
    if (!camId) return

    let cancelled = false
    const startScan = async () => {
      try {
        setError('')
        setStarted(false)
        const state = scanner.getState()
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          await scanner.stop()
        }
        await scanner.start(
          camId,
          {
            fps: fullscreen ? 15 : 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
              const target = fullscreen ? 0.78 : 0.68
              const maxSize = fullscreen ? 620 : 360
              const size = Math.floor(Math.min(minEdge * target, maxSize))
              return { width: size, height: size }
            },
          },
          (decodedText) => {
            const now = Date.now()
            // Anti-rebond : ignore le même code dans les 1,5 s.
            if (
              lastDecodeRef.current.text === decodedText &&
              now - lastDecodeRef.current.at < 1500
            ) {
              return
            }
            lastDecodeRef.current = { text: decodedText, at: now }
            onResultRef.current(decodedText)
          },
          () => {},
        )
        if (!cancelled) setStarted(true)
      } catch {
        if (!cancelled) setError('Impossible de démarrer la caméra.')
      }
    }
    startScan()

    return () => {
      cancelled = true
    }
  }, [cameras, camIndex, fullscreen])

  // Pause / reprise selon `active`.
  useEffect(() => {
    const scanner = scannerRef.current
    if (!scanner || !started) return
    try {
      if (active) {
        if (scanner.getState() === Html5QrcodeScannerState.PAUSED) {
          scanner.resume()
        }
      } else {
        if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
          scanner.pause(true)
        }
      }
    } catch {
      /* ignore */
    }
  }, [active, started])

  if (error) {
    return (
      <div
        className={`flex w-full flex-col items-center justify-center bg-brand-ink/90 p-6 text-center text-white ${
          fullscreen ? 'h-full' : 'aspect-square rounded-2xl'
        } ${className}`}
      >
        <CameraOff className="mb-3 text-brand-gold" />
        <p className="text-sm">{error}</p>
        <p className="mt-2 text-xs text-white/60">
          Utilisez la saisie manuelle ci-dessous en attendant.
        </p>
      </div>
    )
  }

  return (
    <div
      className={`relative w-full max-w-full overflow-hidden bg-black ${
        fullscreen
          ? 'h-full min-h-0 rounded-none'
          : 'aspect-[3/4] max-h-[70vh] rounded-2xl sm:aspect-[4/3]'
      } ${className}`}
    >
      <div
        id={regionId}
        className="h-full w-full [&_canvas]:!h-full [&_canvas]:!w-full [&_div]:!max-w-full [&_video]:!h-full [&_video]:!w-full [&_video]:!object-cover"
      />
      {/* Cadre de visée stylisé */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div
          className={`rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] ${
            fullscreen
              ? 'h-[72vmin] max-h-[620px] w-[72vmin] max-w-[620px]'
              : 'h-2/3 w-2/3'
          }`}
        />
      </div>
      {cameras.length > 1 && (
        <button
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
          onClick={() => setCamIndex((i) => (i + 1) % cameras.length)}
          title="Changer de caméra"
        >
          <SwitchCamera size={18} />
        </button>
      )}
    </div>
  )
}
