import { useEffect, useState } from 'react';
import api, { asList } from '../lib/api';
import { Select } from './ui';

const metros = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Elige de qué rollo sale la tela de una línea de venta.
 *
 * Lista los rollos disponibles de ese producto en ese almacén, con su color y
 * sus metros, que es lo que el vendedor mira para decidir cuál cortar. Si el
 * producto no tiene rollos ahí (un hilo, un cierre), no pide nada.
 *
 * Al editar una venta, el rollo que ya tenía puede no estar "disponible" (se
 * vendió entero, por ejemplo); se trae aparte para que siga apareciendo.
 */
export default function SelectorRollo({ productoId, almacenId, value, onChange }) {
    const [rollos, setRollos] = useState([]);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        if (!productoId || !almacenId) {
            setRollos([]);
            return;
        }

        let vivo = true;
        setCargando(true);

        (async () => {
            try {
                const res = await api.get('/rollos', {
                    params: { producto_id: productoId, almacen_id: almacenId, solo_disponibles: 1 },
                });
                let lista = asList(res);

                if (value && !lista.some((r) => String(r.id) === String(value))) {
                    try {
                        const actual = await api.get(`/rollos/${value}`);
                        const rollo = actual.data?.data ?? actual.data;
                        if (rollo?.id) lista = [rollo, ...lista];
                    } catch {
                        // Si ya no existe, se deja elegir otro.
                    }
                }

                if (vivo) setRollos(lista);
            } catch {
                if (vivo) setRollos([]);
            } finally {
                if (vivo) setCargando(false);
            }
        })();

        return () => {
            vivo = false;
        };
        // `value` solo importa en la primera carga (edición); no se recarga al elegir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productoId, almacenId]);

    if (cargando) return <span className="text-xs text-warm-400">Cargando…</span>;

    if (rollos.length === 0) {
        return (
            <span className="text-xs text-warm-400" title="Este producto no tiene rollos disponibles en el almacén">
                —
            </span>
        );
    }

    return (
        <Select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Rollo"
            options={[
                { value: '', label: 'Elegir rollo…' },
                ...rollos.map((r) => ({
                    value: String(r.id),
                    label: `${r.codigo} · ${r.color?.nombre ?? 'sin color'} · ${metros(r.metros_actual)} m`,
                })),
            ]}
        />
    );
}
