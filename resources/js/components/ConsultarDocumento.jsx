import { useState } from 'react';
import { Search } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { Spinner, cn } from './ui';

/**
 * Botón de lupa para consultar RUC (SUNAT) o DNI (RENIEC). Llama al backend
 * (/api/consulta/{tipo}/{numero}) y entrega el resultado normalizado a
 * `onResult` para que cada formulario rellene sus campos.
 *
 *   RUC → { ruc, razon_social, nombre_comercial, direccion, departamento, provincia, distrito, estado, condicion, telefono }
 *   DNI → { dni, nombres, apellido_paterno, apellido_materno, nombre_completo }
 */
export default function ConsultarDocumento({ tipo = 'dni', numero, onResult, className }) {
    const toast = useToast();
    const [loading, setLoading] = useState(false);

    const largo = tipo === 'ruc' ? 11 : 8;
    const limpio = String(numero ?? '').replace(/\D/g, '');
    const valido = limpio.length === largo;
    const etiqueta = `Consultar ${tipo.toUpperCase()}`;

    const consultar = async () => {
        if (!valido || loading) return;
        setLoading(true);
        try {
            const { data } = await api.get(`/consulta/${tipo}/${limpio}`);
            onResult?.(data);
            toast.success(`${tipo.toUpperCase()} encontrado.`);
        } catch (err) {
            toast.error(err.response?.data?.message ?? `No se pudo consultar el ${tipo.toUpperCase()}.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={consultar}
            disabled={!valido || loading}
            aria-label={etiqueta}
            title={valido ? etiqueta : `Ingresa ${largo} dígitos para consultar`}
            className={cn(
                'inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md text-primary-600 transition',
                'hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
                className,
            )}
        >
            {loading ? <Spinner size="sm" /> : <Search className="h-5 w-5" />}
        </button>
    );
}
