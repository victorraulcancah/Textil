import { useEffect, useMemo, useState } from 'react';
import api, { asList } from '../lib/api';
import { diaLocal } from '../lib/fechas';
import { useToast } from '../lib/toast';
import { Alert, Badge, Button, Modal } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const fechaCorta = (valor) => {
    const dia = diaLocal(valor);
    return dia ? dia.split('-').reverse().join('/') : '—';
};

/**
 * Recuperar los datos de una orden de compra anulada para armar una orden nueva: el proveedor, las condiciones y los
 * productos con sus colores, cantidades y precios. Es solo para no volver a digitarlos: la orden anulada no se toca y la
 * nueva sale con su propio código al guardarla.
 */
export default function RecuperarOrdenModal({ open, onClose, onRecuperar, hayDatos = false }) {
    const toast = useToast();
    const [ordenes, setOrdenes] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [trayendo, setTrayendo] = useState(null);

    useEffect(() => {
        if (!open) return;
        setCargando(true);
        api.get('/ordenes-compra')
            .then((res) => setOrdenes(asList(res).filter((o) => o.estado === 'anulada')))
            .catch(() => toast.error('No se pudieron cargar las órdenes anuladas.'))
            .finally(() => setCargando(false));
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const lista = useMemo(() => [...ordenes].sort((a, b) => b.id - a.id), [ordenes]);

    const recuperar = async (o) => {
        setTrayendo(o.id);
        try {
            const { data } = await api.get(`/ordenes-compra/${o.id}`);
            onRecuperar(data);
        } catch {
            toast.error('No se pudieron traer los datos de esa orden.');
        } finally {
            setTrayendo(null);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="xl"
            title="Recuperar orden anulada"
            description="Trae sus datos a esta orden nueva para no volver a escribirlos."
            footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
        >
            <div className="space-y-3">
                <Alert variant="info">
                    Solo copia los datos. La orden anulada no cambia y esta orden saldrá con su propio código al guardarla.
                </Alert>
                {hayDatos && <Alert variant="warning">Ya llenaste datos en esta orden: al recuperar, se reemplazan.</Alert>}

                {cargando ? (
                    <p className="py-6 text-center text-sm text-warm-500">Cargando órdenes anuladas…</p>
                ) : lista.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">No hay órdenes de compra anuladas.</p>
                ) : (
                    <div className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-edge">
                        {lista.map((o) => (
                            <div key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-warm-900">
                                        {o.codigo_anulado || o.codigo}
                                        <Badge variant="gray" className="ml-2">{o.tipo === 'exterior' ? 'Exterior' : 'Nacional'}</Badge>
                                    </p>
                                    <p className="truncate text-xs text-warm-500">
                                        {o.proveedor?.nombre ?? 'Sin proveedor'} · emitida {fechaCorta(o.fecha_emision)} · {o.detalles_count ?? o.detalles?.length ?? 0} ítem(s)
                                        {o.total != null ? ` · ${money(o.total, o.moneda)}` : ''}
                                    </p>
                                </div>
                                <Button size="sm" loading={trayendo === o.id} onClick={() => recuperar(o)}>
                                    Recuperar datos
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
