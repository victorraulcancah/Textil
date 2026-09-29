import { useMemo } from 'react';
import { Input, SearchSelect } from './ui';
import { departamentos, distritos, esPeru, porCodigo, provincias } from '../lib/ubigeos';

const lugarDe = (u) => ({
    departamento: u.departamento,
    provincia: u.provincia,
    distrito: u.distrito,
    ubigeo: u.ubigeo,
});

/**
 * Departamento → provincia → distrito del Perú, con su ubigeo. Elegir el
 * distrito pone el ubigeo, y escribir un ubigeo de 6 dígitos pone el lugar.
 * Fuera del Perú no hay ubigeo: el lugar se escribe.
 *
 * Devuelve los campos sueltos para que el padre los acomode en su grilla.
 *
 *   lista    — el catálogo de cargarUbigeos()
 *   valor    — { departamento, provincia, distrito, ubigeo }
 *   onChange — (cambios) => void, solo con lo que cambió
 */
export default function SelectorUbigeo({ lista = [], pais, valor, onChange, errores = {} }) {
    const deps = useMemo(() => departamentos(lista), [lista]);
    const cargando = lista.length === 0;

    if (!esPeru(pais)) {
        return (
            <>
                <Input
                    label="Región / estado"
                    value={valor.departamento}
                    onChange={(e) => onChange({ departamento: e.target.value })}
                    error={errores.departamento}
                />
                <Input
                    label="Ciudad"
                    value={valor.provincia}
                    onChange={(e) => onChange({ provincia: e.target.value })}
                    error={errores.provincia}
                />
                <Input
                    label="Distrito / barrio"
                    value={valor.distrito}
                    onChange={(e) => onChange({ distrito: e.target.value })}
                    error={errores.distrito}
                />
            </>
        );
    }

    const ubigeoDesconocido = valor.ubigeo.length === 6 && !cargando && !porCodigo(lista, valor.ubigeo);

    return (
        <>
            <SearchSelect
                label="Departamento"
                value={valor.departamento}
                onChange={(v) => {
                    if (v === valor.departamento) return;
                    onChange({ departamento: v ?? '', provincia: '', distrito: '', ubigeo: '' });
                }}
                options={deps.map((d) => ({ value: d, label: d }))}
                placeholder={cargando ? 'Cargando…' : 'Elegir…'}
                emptyText="Sin coincidencias"
                error={errores.departamento}
            />
            <SearchSelect
                label="Provincia"
                value={valor.provincia}
                onChange={(v) => {
                    if (v === valor.provincia) return;
                    onChange({ provincia: v ?? '', distrito: '', ubigeo: '' });
                }}
                options={provincias(lista, valor.departamento).map((p) => ({ value: p, label: p }))}
                placeholder="Elegir…"
                emptyText="Sin coincidencias"
                disabled={!valor.departamento}
                error={errores.provincia}
            />
            <SearchSelect
                label="Distrito"
                value={valor.ubigeo}
                onChange={(v) => {
                    const u = porCodigo(lista, v);
                    onChange(u ? lugarDe(u) : { distrito: '', ubigeo: '' });
                }}
                options={distritos(lista, valor.departamento, valor.provincia).map((u) => ({
                    value: u.ubigeo,
                    label: u.distrito,
                    keywords: u.ubigeo,
                }))}
                placeholder="Elegir…"
                emptyText="Sin coincidencias"
                disabled={!valor.provincia}
                error={errores.distrito}
            />
            <Input
                label="Ubigeo"
                inputMode="numeric"
                maxLength={6}
                placeholder="Ej. 150101"
                value={valor.ubigeo}
                onChange={(e) => {
                    const codigo = e.target.value.replace(/\D/g, '').slice(0, 6);
                    const u = codigo.length === 6 ? porCodigo(lista, codigo) : null;
                    onChange(u ? lugarDe(u) : { ubigeo: codigo });
                }}
                error={errores.ubigeo ?? (ubigeoDesconocido ? 'Ese ubigeo no existe.' : undefined)}
            />
        </>
    );
}
