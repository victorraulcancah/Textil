import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, RefreshCw, ShieldAlert, TriangleAlert, X } from 'lucide-react';
import { cn } from './ui/cn';

/** Los dos códigos que lleva la etiqueta del rollo. */
const FORMATOS = ['qr_code', 'code_128'];

/** El mismo código leído dos veces seguidas se ignora durante este tiempo. */
const REPETIDO_MS = 2000;

/**
 * Escáner por cámara para las etiquetas de rollo.
 *
 * Es la alternativa a la pistola: misma validación, mismo resultado. Sirve
 * cuando el almacenero anda con el celular por el rack, o cuando la pistola
 * se queda sin batería.
 *
 * Usa `BarcodeDetector`, que Chrome en Android trae de fábrica y va muy
 * rápido. Safari no lo tiene, así que ahí se carga ZXing —y solo ahí: el
 * import es dinámico para que en Android nadie pague esos kilobytes.
 *
 *   onLeer(codigo) => Promise<{ ok: boolean, texto: string }>
 *
 * El visor se queda abierto entre lecturas y va mostrando el resultado de
 * cada una, para escanear treinta rollos seguidos sin tocar la pantalla.
 */
export default function EscanerCamara({ abierto, onCerrar, onLeer, titulo = 'Escanear' }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const pararRef = useRef(null);
    const ultimoRef = useRef({ codigo: null, en: 0 });

    const [estado, setEstado] = useState('iniciando'); // iniciando | leyendo | error
    const [error, setError] = useState(null);
    const [resultado, setResultado] = useState(null);
    const [leidos, setLeidos] = useState(0);

    /** Entrega el código al padre y muestra lo que responda. */
    const procesar = useCallback(
        async (codigo) => {
            const texto = String(codigo ?? '').trim();
            if (!texto) return;

            // La cámara lee el mismo código muchas veces por segundo.
            const ahora = Date.now();
            if (ultimoRef.current.codigo === texto && ahora - ultimoRef.current.en < REPETIDO_MS) {
                return;
            }
            ultimoRef.current = { codigo: texto, en: ahora };

            try {
                const r = (await onLeer?.(texto)) ?? { ok: true, texto };
                setResultado({ ...r, codigo: texto });
                if (r.ok) setLeidos((n) => n + 1);
                if (navigator.vibrate) navigator.vibrate(r.ok ? 60 : [60, 60, 60]);
            } catch (e) {
                setResultado({ ok: false, codigo: texto, texto: e?.message ?? 'No se pudo verificar.' });
            }
        },
        [onLeer],
    );

    useEffect(() => {
        if (!abierto) return undefined;

        let vivo = true;
        setEstado('iniciando');
        setError(null);
        setResultado(null);
        setLeidos(0);
        ultimoRef.current = { codigo: null, en: 0 };

        (async () => {
            // Sin HTTPS el navegador no da la cámara y no lo explica: más vale
            // decirlo aquí que dejar al usuario mirando una pantalla negra.
            if (!window.isSecureContext) {
                setEstado('error');
                setError(
                    'La cámara solo funciona sobre HTTPS. Entra por una dirección segura o usa la pistola.',
                );
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    // La cámara trasera es la que apunta al rollo.
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });

                if (!vivo) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                streamRef.current = stream;
                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    // iOS exige estos dos para reproducir en línea sin pantalla completa.
                    video.setAttribute('playsinline', 'true');
                    video.muted = true;
                    await video.play().catch(() => {});
                }

                setEstado('leyendo');

                if ('BarcodeDetector' in window) {
                    const detector = new window.BarcodeDetector({ formats: FORMATOS });
                    let frame;

                    const mirar = async () => {
                        if (!vivo) return;
                        try {
                            const codigos = await detector.detect(videoRef.current);
                            if (codigos.length) await procesar(codigos[0].rawValue);
                        } catch {
                            // Un fotograma ilegible no es un fallo: se sigue.
                        }
                        frame = requestAnimationFrame(mirar);
                    };
                    frame = requestAnimationFrame(mirar);
                    pararRef.current = () => cancelAnimationFrame(frame);
                } else {
                    // Safari y navegadores viejos: se carga el lector solo aquí.
                    const { BrowserMultiFormatReader } = await import('@zxing/browser');
                    if (!vivo) return;

                    const lector = new BrowserMultiFormatReader();
                    const control = await lector.decodeFromVideoElement(
                        videoRef.current,
                        (r) => r && procesar(r.getText()),
                    );
                    pararRef.current = () => control.stop();
                }
            } catch (e) {
                if (!vivo) return;
                setEstado('error');
                setError(
                    e?.name === 'NotAllowedError'
                        ? 'No diste permiso para usar la cámara. Habilítalo en el navegador y vuelve a intentar.'
                        : e?.name === 'NotFoundError'
                          ? 'Este dispositivo no tiene cámara disponible.'
                          : 'No se pudo abrir la cámara.',
                );
            }
        })();

        return () => {
            vivo = false;
            pararRef.current?.();
            pararRef.current = null;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, [abierto, procesar]);

    // El escáner no puede quedarse encendido de fondo: gasta batería y en
    // algunos teléfonos bloquea la cámara para otras aplicaciones.
    useEffect(() => {
        if (!abierto) return undefined;
        const onEsc = (e) => e.key === 'Escape' && onCerrar?.();
        document.addEventListener('keydown', onEsc);
        return () => document.removeEventListener('keydown', onEsc);
    }, [abierto, onCerrar]);

    if (!abierto) return null;

    return createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-black">
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
                <span className="flex min-w-0 items-center gap-2">
                    <Camera className="h-5 w-5 shrink-0" />
                    <span className="truncate text-sm font-semibold">{titulo}</span>
                </span>
                <span className="flex items-center gap-3">
                    {leidos > 0 && (
                        <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
                            {leidos} leído{leidos === 1 ? '' : 's'}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onCerrar}
                        aria-label="Cerrar"
                        className="rounded-lg p-1.5 transition hover:bg-white/15"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </span>
            </div>

            <div className="relative flex-1 overflow-hidden">
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                />

                {estado === 'leyendo' && (
                    // Marco guía: ayuda a encuadrar la etiqueta.
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-48 w-72 max-w-[80vw] rounded-xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
                    </div>
                )}

                {estado === 'iniciando' && (
                    <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Abriendo la cámara…
                    </p>
                )}

                {estado === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                        <p className="flex max-w-sm items-start gap-2 rounded-lg bg-white/10 p-4 text-sm text-white">
                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                            {error}
                        </p>
                    </div>
                )}
            </div>

            {/* Resultado de la última lectura, sin cerrar el visor. */}
            <div className="px-4 pb-6 pt-3">
                {resultado ? (
                    <div
                        className={cn(
                            'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm',
                            resultado.ok ? 'bg-green-500 text-white' : 'bg-red-500 text-white',
                        )}
                    >
                        {resultado.ok ? (
                            <Check className="h-5 w-5 shrink-0" />
                        ) : (
                            <TriangleAlert className="h-5 w-5 shrink-0" />
                        )}
                        <span className="min-w-0">
                            <strong className="font-mono">{resultado.codigo}</strong> · {resultado.texto}
                        </span>
                    </div>
                ) : (
                    <p className="text-center text-sm text-white/60">
                        Apunta al código de la etiqueta
                    </p>
                )}
            </div>
        </div>,
        document.body,
    );
}
