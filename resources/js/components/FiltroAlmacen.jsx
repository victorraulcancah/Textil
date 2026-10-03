import { useEffect, useState } from 'react';
import { Warehouse } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAlmacenPropio } from '../lib/almacenes';
import { Badge, Select } from './ui';

/**
 * El almacén (sucursal) de un reporte o del escritorio. El Super Admin elige uno o ve el consolidado de todos;
 * un usuario de sucursal ve siempre el suyo, y aquí solo se le dice cuál es.
 */
export default function FiltroAlmacen({ value, onChange, className = 'w-56' }) {
    const { user } = useAuth();
    const { superAdmin } = useAlmacenPropio();
    const [almacenes, setAlmacenes] = useState([]);

    useEffect(() => {
        if (!superAdmin) return;
        api.get('/almacenes')
            .then((res) => setAlmacenes(asList(res)))
            .catch(() => {});
    }, [superAdmin]);

    if (!superAdmin) {
        return (
            <Badge variant="blue" className="whitespace-nowrap">
                <Warehouse className="mr-1 h-3 w-3" />
                {user?.almacen?.nombre ?? 'Sin almacén asignado'}
            </Badge>
        );
    }

    return (
        <Select
            label="Almacén"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            options={[
                { value: '', label: 'Todos los almacenes' },
                ...almacenes.filter((a) => a.activo !== false).map((a) => ({ value: String(a.id), label: a.nombre })),
            ]}
            className={className}
        />
    );
}
