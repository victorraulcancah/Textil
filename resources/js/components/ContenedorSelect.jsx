import { useEffect, useState } from 'react';
import CatalogoSelect from './CatalogoSelect';
import { Input } from './ui';

/** "2X40 HC" → { cantidad: '2', tipo: '40 HC' }. Lo que no encaja queda como texto suelto en `tipo`. */
const leer = (valor) => {
    const texto = String(valor ?? '').trim();
    if (!texto) return { cantidad: '', tipo: '' };
    const m = texto.match(/^(\d+)\s*[xX]\s*(.+)$/);
    return m ? { cantidad: m[1], tipo: m[2].trim() } : { cantidad: '', tipo: texto };
};

/**
 * Los contenedores de la orden: cuántos (N° CNT) y de qué tipo y tamaño
 * (TIPO / TAMAÑO: 20 GP, 40 NOR, 40 HC… que se administran con el icono de
 * más). El valor que sale es el que se imprime en la Purchase Order: "2X40 HC".
 */
export default function ContenedorSelect({ value, onChange, className }) {
    const [datos, setDatos] = useState(() => leer(value));

    // Si la orden se carga o cambia desde fuera, se vuelve a leer.
    useEffect(() => {
        const actual = datos.tipo ? `${datos.cantidad || 1}X${datos.tipo}` : '';
        if ((value ?? '') !== actual) setDatos(leer(value));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const cambiar = (cambios) => {
        const siguiente = { ...datos, ...cambios };
        setDatos(siguiente);
        // Sin tipo no hay contenedor que imprimir.
        onChange?.(siguiente.tipo ? `${siguiente.cantidad || 1}X${siguiente.tipo}` : '');
    };

    return (
        <div className={className}>
            <div className="flex items-end gap-3">
                <div className="w-24 shrink-0">
                    <Input
                        label="N° CNT"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="1"
                        value={datos.cantidad}
                        onChange={(e) => cambiar({ cantidad: e.target.value.replace(/\D/g, '') })}
                        className="text-center"
                    />
                </div>
                <CatalogoSelect
                    className="min-w-0 flex-1"
                    label="Tipo / tamaño"
                    titulo="Tipos de contenedor"
                    endpoint="/tipos-contenedor"
                    value={datos.tipo}
                    onChange={(tipo) => cambiar({ tipo })}
                    placeholder="—"
                />
            </div>
        </div>
    );
}
