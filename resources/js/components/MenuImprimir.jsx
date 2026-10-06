import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Button } from './ui';

/**
 * Un solo botón "Imprimir" que despliega las salidas de un listado: exportar a Excel y a PDF.
 *
 *   onExcel — descarga el Excel
 *   onPdf   — abre el PDF
 */
export default function MenuImprimir({ onExcel, onPdf, etiqueta = 'Imprimir' }) {
    const [abierto, setAbierto] = useState(false);
    const caja = useRef(null);

    useEffect(() => {
        if (!abierto) return undefined;
        const cerrar = (e) => !caja.current?.contains(e.target) && setAbierto(false);
        const tecla = (e) => e.key === 'Escape' && setAbierto(false);
        document.addEventListener('mousedown', cerrar);
        document.addEventListener('keydown', tecla);
        return () => {
            document.removeEventListener('mousedown', cerrar);
            document.removeEventListener('keydown', tecla);
        };
    }, [abierto]);

    const elegir = (accion) => () => {
        setAbierto(false);
        accion();
    };

    return (
        <div ref={caja} className="relative">
            <Button variant="secondary" onClick={() => setAbierto((v) => !v)} aria-haspopup="menu" aria-expanded={abierto}>
                <Printer className="h-4 w-4" />
                {etiqueta}
                <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {abierto && (
                <div role="menu" className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border border-edge bg-white py-1 shadow-lg">
                    <button type="button" role="menuitem" onClick={elegir(onExcel)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warm-800 hover:bg-gray-50">
                        <FileSpreadsheet className="h-4 w-4 text-green-600" /> Exportar a Excel
                    </button>
                    <button type="button" role="menuitem" onClick={elegir(onPdf)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-warm-800 hover:bg-gray-50">
                        <FileText className="h-4 w-4 text-red-600" /> Exportar a PDF
                    </button>
                </div>
            )}
        </div>
    );
}
