import { useState } from 'react';
import { Search } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { Button } from './ui';

/**
 * Botón "Consultar" para RUC (SUNAT) o DNI (RENIEC). Llama al backend
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

    const consultar = async () => {
        if (!valido) {
            toast.error(`El ${tipo.toUpperCase()} debe tener ${largo} dígitos.`);
            return;
        }
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
        <Button
            type="button"
            variant="secondary"
            onClick={consultar}
            loading={loading}
            disabled={!valido}
            title={`Consultar ${tipo.toUpperCase()}`}
            className={className}
        >
            {!loading && <Search className="h-4 w-4" />}
            Consultar
        </Button>
    );
}
