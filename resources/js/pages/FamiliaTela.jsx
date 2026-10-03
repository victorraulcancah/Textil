import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Layers3, Shapes } from 'lucide-react';
import api, { asList } from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable } from '../components/ui';

/**
 * Una familia de tela con sus tipos: se llega con doble clic desde "Familias y tipos de tela".
 * Es de consulta; los tipos se crean y editan en la pestaña Tipos de tela.
 */
export default function FamiliaTela() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [familia, setFamilia] = useState(null);
    const [tipos, setTipos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [famRes, tipRes] = await Promise.all([api.get('/familias-tela'), api.get('/tipos-tela')]);
            const encontrada = asList(famRes).find((f) => String(f.id) === String(id)) ?? null;
            setFamilia(encontrada);
            setTipos(asList(tipRes).filter((t) => String(t.familia_tela_id) === String(id)));
            if (!encontrada) setError('No se encontró esa familia.');
        } catch {
            setError('No se pudieron cargar los tipos de tela.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const columnas = [
        {
            key: 'codigo_completo',
            label: 'Código',
            getSearchValue: (row) => `${familia?.codigo ?? ''}-${row.codigo}`,
            render: (row) => <Badge variant="blue">{familia?.codigo}-{row.codigo}</Badge>,
        },
        {
            key: 'nombre',
            label: 'Tipo de tela',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Shapes className="h-4 w-4 text-primary-600" /> {row.nombre}
                </span>
            ),
        },
        { key: 'productos_count', label: 'Telas', searchable: false, render: (row) => `${row.productos_count ?? 0} tela(s)` },
        {
            key: 'activo',
            label: 'Estado',
            searchable: false,
            render: (row) => (row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title={familia ? `Tipos de tela · ${familia.nombre}` : 'Tipos de tela'}
                description={familia ? `Familia ${familia.codigo} · ${tipos.length} ${tipos.length === 1 ? 'tipo' : 'tipos'}` : undefined}
                actions={
                    <Button variant="secondary" onClick={() => navigate('/tipos-tela')}>
                        <ArrowLeft className="h-4 w-4" />
                        Familias
                    </Button>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {familia && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-edge bg-white px-4 py-3 shadow-sm">
                    <span className="rounded-md bg-primary-50 p-2 text-primary-600">
                        <Layers3 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                        <span className="block text-xs uppercase tracking-wide text-warm-500">Familia</span>
                        <span className="block truncate text-lg font-semibold text-warm-900">{familia.nombre}</span>
                    </span>
                    <span className="ml-auto">{familia.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>}</span>
                </div>
            )}

            <DataTable
                columns={columnas}
                rows={tipos}
                loading={loading}
                searchPlaceholder="Buscar tipo de tela..."
                emptyMessage="Esta familia todavía no tiene tipos de tela."
            />
        </Layout>
    );
}
