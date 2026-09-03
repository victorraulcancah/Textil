import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, FileText, Loader2, Printer, X } from 'lucide-react';
import { descargarPdf, obtenerPdf } from '../lib/pdf';
import { useToast } from '../lib/toast';

/**
 * ¿El navegador dibuja PDFs dentro de la página? Los navegadores móviles no
 * traen visor integrado: al ponerlos en un iframe muestran un recuadro con el
 * identificador del blob en vez del documento. En ese caso conviene ofrecer
 * abrir o descargar en lugar de incrustar.
 */
const soportaPdfIncrustado = () => {
    if (typeof navigator === 'undefined') return true;
    if (typeof navigator.pdfViewerEnabled === 'boolean') return navigator.pdfViewerEnabled;
    return typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true;
};

/**
 * Modal que renderiza el PDF de un documento dentro de una tarjeta centrada
 * (mismo estilo que el resto de modales). Carga el documento como blob (para
 * llevar el token), lo muestra en un iframe y permite cambiar de formato
 * (A4 / ticket), imprimir y descargar. Reutilizable en ventas, compras, etc.
 *
 *   <PdfViewerModal open tipo="nota-venta" id={12} nombre="NV01-00000012"
 *       formatos={['a4','ticket']} titulo="Nota de venta" onClose={...} />
 */
export default function PdfViewerModal({
    open,
    onClose,
    tipo,
    id,
    nombre,
    titulo = 'Documento',
    formatos = ['a4'],
}) {
    const toast = useToast();
    const iframeRef = useRef(null);
    const urlRef = useRef(null);
    const [formato, setFormato] = useState(formatos[0]);
    const [url, setUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [incrustable] = useState(soportaPdfIncrustado);

    // Al abrir se resetea al primer formato disponible.
    useEffect(() => {
        if (open) setFormato(formatos[0]);
    }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open || !tipo || id == null) return;
        let vigente = true;
        setLoading(true);
        obtenerPdf(tipo, id, { formato })
            .then((blobUrl) => {
                if (!vigente) return URL.revokeObjectURL(blobUrl);
                if (urlRef.current) URL.revokeObjectURL(urlRef.current);
                urlRef.current = blobUrl;
                setUrl(blobUrl);
            })
            .catch(() => toast.error('No se pudo generar el PDF.'))
            .finally(() => vigente && setLoading(false));

        return () => {
            vigente = false;
        };
    }, [open, tipo, id, formato]); // eslint-disable-line react-hooks/exhaustive-deps

    // Al cerrar del todo se libera el blob.
    useEffect(() => {
        if (open) return;
        setUrl(null);
        if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
            urlRef.current = null;
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    const abrir = () => url && window.open(url, '_blank', 'noopener');

    const imprimir = () => {
        // En móvil se abre en el visor del sistema, que ya ofrece imprimir.
        if (!incrustable) return abrir();

        const frame = iframeRef.current;
        if (!frame) return;
        try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch {
            toast.error('No se pudo abrir el diálogo de impresión.');
        }
    };

    const nombreFmt = { a4: 'A4', ticket: 'Ticket' };

    return createPortal(
        <div className="fixed inset-0 z-[110] overflow-y-auto">
            <div className="flex min-h-dvh items-center justify-center p-4">
                <div
                    className="fixed inset-0 bg-black/50"
                    onClick={onClose}
                    aria-hidden="true"
                />

                {/* Tarjeta del modal: A4 ancho, ticket angosto (según su proporción) */}
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={titulo}
                    className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${
                        formato === 'ticket' ? 'max-w-md' : 'max-w-3xl'
                    }`}
                >
                    {/* Cabecera */}
                    <div className="flex items-center gap-3 border-b border-edge px-5 py-3">
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-semibold text-warm-900">{titulo}</h2>
                            {nombre && <p className="truncate text-xs text-warm-500">{nombre}</p>}
                        </div>

                        {formatos.length > 1 && (
                            <div className="ml-2 flex overflow-hidden rounded-lg border border-edge">
                                {formatos.map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => setFormato(f)}
                                        className={`px-3 py-1 text-xs font-medium transition ${
                                            formato === f
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-white text-warm-700 hover:bg-primary-50'
                                        }`}
                                    >
                                        {nombreFmt[f] ?? f}
                                    </button>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="ml-auto rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* PDF: se ajusta al ancho para no dejar franjas grises a los costados */}
                    <div
                        className="relative flex-1 overflow-hidden bg-gray-100"
                        style={{ minHeight: incrustable ? '76vh' : '18rem' }}
                    >
                        {loading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                            </div>
                        )}
                        {url && incrustable && (
                            <iframe
                                ref={iframeRef}
                                title={titulo}
                                src={`${url}#zoom=page-width&toolbar=1&navpanes=0`}
                                className="h-full w-full border-0"
                                style={{ minHeight: '76vh' }}
                            />
                        )}
                        {url && !incrustable && (
                            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                                    <FileText className="h-8 w-8" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-warm-900">{nombre ?? titulo}</p>
                                    <p className="mt-1 text-xs text-warm-500">
                                        Tu navegador no muestra PDF dentro de la página. Ábrelo o descárgalo para verlo.
                                    </p>
                                </div>
                                <button
                                    onClick={abrir}
                                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
                                >
                                    <ExternalLink className="h-4 w-4" /> Abrir PDF
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Pie con acciones */}
                    <div className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3">
                        <button
                            onClick={imprimir}
                            disabled={!url}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-warm-700 transition hover:bg-gray-50 disabled:opacity-40"
                        >
                            {incrustable ? (
                                <><Printer className="h-4 w-4" /> Imprimir</>
                            ) : (
                                <><ExternalLink className="h-4 w-4" /> Abrir</>
                            )}
                        </button>
                        <button
                            onClick={() => descargarPdf(tipo, id, { formato, nombre })}
                            disabled={!url}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-40"
                        >
                            <Download className="h-4 w-4" /> Descargar
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
