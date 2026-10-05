import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Dibuja un PDF página por página dentro de la propia pantalla (con pdf.js). Es para los navegadores del celular,
 * que no traen visor de PDF y no pueden mostrarlo en un iframe. La librería se descarga solo cuando se necesita.
 *
 * El ancho de cada página se ajusta al del contenedor; con el gesto de pellizcar se puede acercar.
 */
export default function PdfCanvas({ url, onError }) {
    const contenedor = useRef(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        if (!url || !contenedor.current) return undefined;
        let vigente = true;
        let documento = null;
        const host = contenedor.current;
        host.replaceChildren();
        setCargando(true);

        (async () => {
            try {
                const pdfjs = await import('pdfjs-dist');
                pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
                documento = await pdfjs.getDocument({ url }).promise;

                // Nítido en pantallas de alta densidad sin gastar memoria de más.
                const densidad = Math.min(window.devicePixelRatio || 1, 2);

                for (let n = 1; n <= documento.numPages; n += 1) {
                    if (!vigente) return;
                    const pagina = await documento.getPage(n);
                    const ancho = host.clientWidth || 320;
                    const base = pagina.getViewport({ scale: 1 });
                    const vista = pagina.getViewport({ scale: (ancho / base.width) * densidad });

                    const canvas = document.createElement('canvas');
                    canvas.width = Math.floor(vista.width);
                    canvas.height = Math.floor(vista.height);
                    canvas.style.cssText = 'width:100%;height:auto;display:block;margin:0 auto 8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)';
                    host.appendChild(canvas);

                    await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vista }).promise;
                    if (n === 1 && vigente) setCargando(false);
                }
            } catch (e) {
                if (vigente) onError?.(e);
            } finally {
                if (vigente) setCargando(false);
            }
        })();

        return () => {
            vigente = false;
            documento?.destroy();
        };
    }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="relative h-full w-full overflow-y-auto bg-gray-200 p-2" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
            {cargando && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                </div>
            )}
            <div ref={contenedor} />
        </div>
    );
}
