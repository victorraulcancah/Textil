/** El día (aaaa-mm-dd) en la hora local de una fecha o de una marca de tiempo; '' si no hay. Una fecha sola se respeta. */
export const diaLocal = (valor) => {
    if (!valor) return '';
    if (String(valor).length === 10) return String(valor);
    const d = new Date(valor);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** El día de hoy ("2026-10-06") en la hora local, no en UTC: de noche en Perú `toISOString` ya marcaría mañana. */
export const hoyIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
