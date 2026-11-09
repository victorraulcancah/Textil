import { useNavigate } from 'react-router-dom';
import { Layers, Scissors } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Tabs } from './ui';

/**
 * Las pestañas de los submódulos de stock: el stock por rollo (cada rollo con su QR) y el stock por metros (tela suelta que
 * se vende por corte, sin QR). Cada una es su propia pantalla; aquí solo se salta de una a otra.
 */
export default function PestanasStock({ activa }) {
    const navigate = useNavigate();
    const { puede } = useAuth();

    const items = [
        { key: 'rollos', label: 'Stock por rollo', icon: Layers, to: '/stock-rollos', permiso: 'inventario.rollos.ver' },
        { key: 'metros', label: 'Stock por metros', icon: Scissors, to: '/stock-metros', permiso: 'inventario.stock-metros.ver' },
    ].filter((i) => puede(i.permiso));

    // Con una sola pestaña no hay a dónde saltar.
    if (items.length < 2) return null;

    return (
        <div className="mb-4">
            <Tabs
                items={items}
                value={activa}
                onChange={(clave) => {
                    if (clave !== activa) navigate(items.find((i) => i.key === clave).to);
                }}
            />
        </div>
    );
}
