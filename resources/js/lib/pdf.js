import api from './api';

/**
 * Descarga el PDF de un documento como blob (así viaja el token JWT; un
 * window.open directo no lo llevaría) y devuelve una URL de objeto lista para
 * mostrar en un iframe o forzar la descarga.
 *
 *   tipo    → clave registrada en config/pdf.php (ej. 'nota-venta')
 *   id      → id del documento
 *   formato → 'a4' | 'ticket'
 */
export async function obtenerPdf(tipo, id, { formato = 'a4', descargar = false } = {}) {
    const { data } = await api.get(`/pdf/${tipo}/${id}`, {
        params: { formato, descargar: descargar ? 1 : undefined },
        responseType: 'blob',
    });
    return URL.createObjectURL(data);
}

/** Dispara la descarga del PDF con un nombre de archivo. */
export async function descargarPdf(tipo, id, { formato = 'a4', nombre } = {}) {
    const url = await obtenerPdf(tipo, id, { formato, descargar: true });
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre ? `${nombre}.pdf` : `${tipo}-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Se libera al rato para no cortar la descarga.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
