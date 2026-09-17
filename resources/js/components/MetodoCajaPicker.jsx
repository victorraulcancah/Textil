import { SearchSelect, Select } from './ui';

const cuentaLabel = (c) => [c.banco?.nombre, c.alias, c.numero_cuenta].filter(Boolean).join(' · ');
const billeteraLabel = (b) => [b.nombre, b.titular, b.numero_asociado].filter(Boolean).join(' · ');

/**
 * Selector de método por tipo (Efectivo / Transferencia / Billetera).
 * Al elegir transferencia o billetera se despliega el detalle
 * (banco + cuenta / titular + teléfono).
 *
 * Fuentes: pasa `cuentas` y `billeteras` (arrays) y `aceptaEfectivo`.
 * value = { tipo, cuentaId, billeteraId }
 */
export default function MetodoCajaPicker({
    cuentas = [],
    billeteras = [],
    aceptaEfectivo = true,
    tipo,
    cuentaId,
    billeteraId,
    onChange,
    error,
    compact = false,
}) {
    const tipos = [{ value: '', label: 'Tipo de método' }];
    if (aceptaEfectivo) tipos.push({ value: 'efectivo', label: 'Efectivo' });
    if (cuentas.length) tipos.push({ value: 'transferencia', label: 'Transferencia' });
    if (billeteras.length) tipos.push({ value: 'billetera', label: 'Billetera digital' });

    return (
        <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
            <Select
                label={compact ? undefined : 'Tipo de método'}
                value={tipo}
                onChange={(e) => onChange({ tipo: e.target.value, cuentaId: '', billeteraId: '' })}
                options={tipos}
                error={error}
            />
            {tipo === 'transferencia' && (
                <SearchSelect
                    label={compact ? undefined : 'Cuenta bancaria'}
                    value={cuentaId}
                    onChange={(v) => onChange({ tipo, cuentaId: v ?? '', billeteraId: '' })}
                    placeholder="Selecciona la cuenta"
                    emptyText="Sin coincidencias"
                    options={cuentas.map((c) => ({ value: String(c.id), label: cuentaLabel(c) }))}
                />
            )}
            {tipo === 'billetera' && (
                <SearchSelect
                    label={compact ? undefined : 'Billetera'}
                    value={billeteraId}
                    onChange={(v) => onChange({ tipo, cuentaId: '', billeteraId: v ?? '' })}
                    placeholder="Selecciona la billetera"
                    emptyText="Sin coincidencias"
                    options={billeteras.map((b) => ({ value: String(b.id), label: billeteraLabel(b) }))}
                />
            )}
        </div>
    );
}
