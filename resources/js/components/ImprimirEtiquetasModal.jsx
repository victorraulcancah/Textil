import { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import api from '../lib/api';
import { Alert, Button, Input, Modal, SearchSelect, Select } from './ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const METRAJES = [
    { value: '', label: 'Cualquiera' },
    { value: 'exacto', label: 'Metraje exacto' },
    { value: 'rango', label: 'Rango de metraje' },
];

const VACIO = { tipo: '', color: '', orden: '', metraje: '', exacto: '', desde: '', hasta: '', estado: 'disponible' };

/**
 * Imprimir las etiquetas QR de los rollos que cumplan un filtro: tipo de tela, color, orden de compra y metraje (exacto
 * o en un rango). Muestra en vivo cuántos rollos salen antes de imprimir. El metraje es lo que hay hoy en cada rollo.
 */
export default function ImprimirEtiquetasModal({ open, onClose, almacenId = '', tipoInicial = '', onImprimir }) {
    const [opciones, setOpciones] = useState(null);
    const [f, setF] = useState(VACIO);
    const [conteo, setConteo] = useState(null);
    const [contando, setContando] = useState(false);

    const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

    useEffect(() => {
        if (!open) return;
        setF({ ...VACIO, tipo: tipoInicial && tipoInicial !== 'sin' ? tipoInicial : '' });
        setConteo(null);
        if (opciones) return;
        api.get('/rollos/etiquetas/opciones')
            .then(({ data }) => setOpciones(data))
            .catch(() => setOpciones({ tipos: [], colores: [], ordenes: [], estados: [] }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /** Los parámetros que entiende el servidor (los vacíos no viajan). */
    const params = useMemo(() => {
        const p = {};
        if (f.tipo) p.tipo_tela_id = f.tipo;
        if (f.color) p.color_id = f.color;
        if (f.orden) p.orden_compra_id = f.orden;
        if (f.metraje === 'exacto' && f.exacto !== '') p.metros = f.exacto;
        if (f.metraje === 'rango') {
            if (f.desde !== '') p.metros_desde = f.desde;
            if (f.hasta !== '') p.metros_hasta = f.hasta;
        }
        if (f.estado) p.estado = f.estado;
        if (almacenId) p.almacen_id = almacenId;
        return p;
    }, [f, almacenId]);

    /** Con solo el estado o el almacén se imprimiría todo el stock: se pide al menos un filtro de los de arriba. */
    const hayFiltro = Boolean(params.tipo_tela_id || params.color_id || params.orden_compra_id || params.metros || params.metros_desde || params.metros_hasta);

    useEffect(() => {
        if (!open || !hayFiltro) {
            setConteo(null);
            return;
        }
        setContando(true);
        let vigente = true;
        const t = setTimeout(() => {
            api.get('/rollos/etiquetas/conteo', { params })
                .then(({ data }) => vigente && setConteo(data))
                .catch(() => vigente && setConteo(null))
                .finally(() => vigente && setContando(false));
        }, 300);

        return () => {
            vigente = false;
            clearTimeout(t);
        };
    }, [open, hayFiltro, params]);

    if (!open) return null;

    const ordenes = opciones?.ordenes ?? [];
    const imprimir = () => {
        const query = new URLSearchParams(params).toString();
        onImprimir({ url: `/rollos/etiquetas?${query}`, titulo: `Etiquetas QR · ${conteo?.rollos ?? ''} rollos` });
        onClose();
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Imprimir etiquetas QR"
            description="Elige qué rollos etiquetar: salen las que cumplan todos los filtros."
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button disabled={!conteo || conteo.rollos === 0} onClick={imprimir}>
                        <Printer className="h-4 w-4" />
                        Imprimir{conteo?.rollos ? ` ${conteo.rollos} etiquetas` : ''}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SearchSelect
                        label="Tipo de tela"
                        value={f.tipo}
                        onChange={(v) => set({ tipo: v ?? '' })}
                        placeholder="Todos los tipos"
                        options={(opciones?.tipos ?? []).map((t) => ({ value: String(t.id), label: t.nombre }))}
                    />
                    <SearchSelect
                        label="Color"
                        value={f.color}
                        onChange={(v) => set({ color: v ?? '' })}
                        placeholder="Todos los colores"
                        options={(opciones?.colores ?? []).map((c) => ({ value: String(c.id), label: c.nombre }))}
                    />
                    <SearchSelect
                        label="Orden de compra"
                        value={f.orden}
                        onChange={(v) => set({ orden: v ?? '' })}
                        placeholder={ordenes.length ? 'Todas las órdenes' : 'Ningún rollo viene de una orden'}
                        disabled={!ordenes.length}
                        options={ordenes.map((o) => ({ value: String(o.id), label: o.codigo }))}
                    />
                    <Select
                        label="Estado del rollo"
                        value={f.estado}
                        onChange={(e) => set({ estado: e.target.value })}
                        options={[{ value: '', label: 'Todos los estados' }, ...(opciones?.estados ?? [])]}
                    />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Select label="Metraje" value={f.metraje} onChange={(e) => set({ metraje: e.target.value })} options={METRAJES} />
                    {f.metraje === 'exacto' && (
                        <Input label="Metros" type="number" min="0" step="0.01" value={f.exacto} onChange={(e) => set({ exacto: e.target.value })} placeholder="50" />
                    )}
                    {f.metraje === 'rango' && (
                        <>
                            <Input label="Desde (m)" type="number" min="0" step="0.01" value={f.desde} onChange={(e) => set({ desde: e.target.value })} placeholder="50" />
                            <Input label="Hasta (m)" type="number" min="0" step="0.01" value={f.hasta} onChange={(e) => set({ hasta: e.target.value })} placeholder="70" />
                        </>
                    )}
                </div>

                {!hayFiltro ? (
                    <Alert variant="info">Elige al menos un tipo de tela, color, orden de compra o metraje.</Alert>
                ) : contando && !conteo ? (
                    <p className="text-sm text-warm-500">Contando rollos…</p>
                ) : conteo ? (
                    conteo.rollos === 0 ? (
                        <Alert variant="warning">Ningún rollo cumple ese filtro.</Alert>
                    ) : (
                        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
                            Se imprimen <strong>{num(conteo.rollos)}</strong> etiquetas · {num(conteo.metros)} m en total.
                            {conteo.rollos > 300 && <span className="block text-xs text-warm-500">Es un lote grande: el PDF puede tardar un poco en generarse.</span>}
                        </div>
                    )
                ) : null}
            </div>
        </Modal>
    );
}
