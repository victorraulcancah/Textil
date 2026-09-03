import { useCallback, useEffect, useState } from 'react';
import { Building2, Save, Users } from 'lucide-react';
import api from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Button, Card, DataTable, Input, Tabs } from '../components/ui';

export default function Empresa() {
    const [empresa, setEmpresa] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [tab, setTab] = useState('datos');
    const [form, setForm] = useState({
        ruc: '',
        razon_social: '',
        nombre_comercial: '',
        direccion: '',
        departamento: '',
        provincia: '',
        distrito: '',
        ciudad: '',
        telefono: '',
        email: '',
        activa: true,
    });
    const [errors, setErrors] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get('/empresas');
            const current = data[0] ?? null;
            setEmpresa(current);
            if (current) {
                setForm({
                    ruc: current.ruc ?? '',
                    razon_social: current.razon_social ?? '',
                    nombre_comercial: current.nombre_comercial ?? '',
                    direccion: current.direccion ?? '',
                    departamento: current.departamento ?? '',
                    provincia: current.provincia ?? '',
                    distrito: current.distrito ?? '',
                    ciudad: current.ciudad ?? '',
                    telefono: current.telefono ?? '',
                    email: current.email ?? '',
                    activa: current.activa ?? false,
                });
            }
        } catch {
            setError('No se pudo cargar la empresa.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        setSaved(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!empresa) return;
        setSaving(true);
        setErrors({});
        setSaved(false);

        try {
            const { data } = await api.put(`/empresas/${empresa.id}`, form);
            setEmpresa(data);
            setSaved(true);
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setErrors(
                    Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])),
                );
            } else {
                setError('No se pudo guardar la empresa.');
            }
        } finally {
            setSaving(false);
        }
    };

    const userColumns = [
        {
            key: 'name',
            label: 'Nombre',
            render: (row) => (
                <span className="font-medium text-warm-900">{row.name}</span>
            ),
        },
        { key: 'email', label: 'Correo' },
    ];

    return (
        <Layout>
            <PageHeader
                title="Empresa"
                description="Datos de la empresa y sus usuarios"
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {loading ? (
                <Card>
                    <p className="text-sm text-gray-400">Cargando...</p>
                </Card>
            ) : !empresa ? (
                <Card>
                    <p className="text-sm text-gray-500">
                        No hay ninguna empresa registrada.
                    </p>
                </Card>
            ) : (
                <Card>
                    <div className="-m-4 mb-4 sm:-m-6 sm:mb-6">
                        <Tabs
                            value={tab}
                            onChange={setTab}
                            color="primary"
                            items={[
                                { key: 'datos', label: 'Datos de la empresa', icon: Building2 },
                                { key: 'usuarios', label: 'Usuarios', icon: Users },
                            ]}
                        />
                    </div>

                    {tab === 'datos' && (
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Input
                                    label="RUC"
                                    name="ruc"
                                    value={form.ruc}
                                    onChange={handleChange}
                                    error={errors.ruc}
                                />
                                <Input
                                    label="Razón social"
                                    name="razon_social"
                                    value={form.razon_social}
                                    onChange={handleChange}
                                    error={errors.razon_social}
                                />
                            <Input
                                label="Nombre comercial"
                                name="nombre_comercial"
                                value={form.nombre_comercial}
                                onChange={handleChange}
                                error={errors.nombre_comercial}
                            />
                            <Input
                                label="Departamento"
                                name="departamento"
                                value={form.departamento}
                                onChange={handleChange}
                                error={errors.departamento}
                            />
                            <Input
                                label="Provincia"
                                name="provincia"
                                value={form.provincia}
                                onChange={handleChange}
                                error={errors.provincia}
                            />
                            <Input
                                label="Distrito"
                                name="distrito"
                                value={form.distrito}
                                onChange={handleChange}
                                error={errors.distrito}
                            />
                            <Input
                                label="Ciudad"
                                name="ciudad"
                                value={form.ciudad}
                                onChange={handleChange}
                                error={errors.ciudad}
                            />
                            <Input
                                label="Teléfono"
                                name="telefono"
                                value={form.telefono}
                                onChange={handleChange}
                                error={errors.telefono}
                            />
                                <Input
                                    label="Correo"
                                    name="email"
                                    type="email"
                                    value={form.email}
                                    onChange={handleChange}
                                    error={errors.email}
                                />
                            </div>
                            <Input
                                label="Dirección"
                                name="direccion"
                                value={form.direccion}
                                onChange={handleChange}
                                error={errors.direccion}
                            />
                            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    name="activa"
                                    checked={form.activa}
                                    onChange={handleChange}
                                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                />
                                Empresa activa
                            </label>

                            <div className="flex items-center gap-3">
                                <Button type="submit" loading={saving}>
                                    <Save className="h-4 w-4" />
                                    Guardar cambios
                                </Button>
                                {saved && (
                                    <span className="text-sm font-medium text-green-600">
                                        Guardado correctamente
                                    </span>
                                )}
                            </div>
                        </form>
                    )}

                    {tab === 'usuarios' && (
                        <DataTable
                            columns={userColumns}
                            rows={empresa.users ?? []}
                            searchPlaceholder="Buscar usuarios..."
                        />
                    )}
                </Card>
            )}
        </Layout>
    );
}
