import { useEffect, useState } from 'react';

/** Lo más grande que se dibuja el logo para medirlo: suficiente para encontrar sus bordes y verse nítido. */
const LADO = 640;

/** Un píxel "de fondo": transparente o casi blanco. */
const esFondo = (r, g, b, a) => a < 25 || (r >= 242 && g >= 242 && b >= 242);

/**
 * Recorta el logo a lo que se ve (sin los márgenes transparentes o blancos que traen las imágenes y los SVG) y devuelve la
 * imagen recortada como URL de datos; null si no se puede (otra procedencia, logo vacío…).
 */
function recortar(img) {
    const w = img.naturalWidth || 300;
    const h = img.naturalHeight || 300;
    const escala = LADO / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * escala));
    const ch = Math.max(1, Math.round(h * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = cw;
    lienzo.height = ch;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cw, ch);

    const { data } = ctx.getImageData(0, 0, cw, ch);
    let [minX, minY, maxX, maxY] = [cw, ch, -1, -1];
    for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
            const i = (y * cw + x) * 4;
            if (!esFondo(data[i], data[i + 1], data[i + 2], data[i + 3])) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;

    // Un poco de aire alrededor.
    const aire = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
    const x0 = Math.max(0, minX - aire);
    const y0 = Math.max(0, minY - aire);
    const x1 = Math.min(cw - 1, maxX + aire);
    const y1 = Math.min(ch - 1, maxY + aire);

    const recorte = document.createElement('canvas');
    recorte.width = x1 - x0 + 1;
    recorte.height = y1 - y0 + 1;
    recorte.getContext('2d').drawImage(lienzo, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);

    return recorte.toDataURL('image/png');
}

/**
 * El logo de la empresa ajustado a su marco: se recorta a lo que se ve y llena el espacio que se le da (con `className`
 * `h-full w-full object-contain`, por ejemplo), sin importar cuánto margen en blanco traiga el archivo. Si no se puede
 * recortar, se muestra tal cual.
 */
export default function LogoRecortado({ src, alt, className }) {
    const [url, setUrl] = useState(null);

    useEffect(() => {
        let vivo = true;
        setUrl(null);
        if (!src) return undefined;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let resultado = null;
            try {
                resultado = recortar(img);
            } catch {
                /* imagen de otro origen sin permiso: se muestra tal cual */
            }
            if (vivo) setUrl(resultado ?? src);
        };
        img.onerror = () => vivo && setUrl(src);
        img.src = src;

        return () => {
            vivo = false;
        };
    }, [src]);

    // Hasta tenerlo recortado no se muestra nada, para que no se vea primero chico y luego crezca.
    return <img src={url ?? src} alt={alt} className={className} style={url ? undefined : { visibility: 'hidden' }} />;
}
