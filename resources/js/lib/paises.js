/**
 * "China" → "CHINA - CN": el país como se escribe en la Purchase Order (nombre
 * en mayúsculas y su código ISO). Un país que no está en la lista queda solo
 * con su nombre en mayúsculas.
 */
const CODIGOS = {
    alemania: 'DE',
    argentina: 'AR',
    bangladesh: 'BD',
    bolivia: 'BO',
    brasil: 'BR',
    chile: 'CL',
    china: 'CN',
    colombia: 'CO',
    'corea del sur': 'KR',
    ecuador: 'EC',
    egipto: 'EG',
    espana: 'ES',
    'estados unidos': 'US',
    francia: 'FR',
    'hong kong': 'HK',
    india: 'IN',
    indonesia: 'ID',
    italia: 'IT',
    japon: 'JP',
    mexico: 'MX',
    pakistan: 'PK',
    paraguay: 'PY',
    peru: 'PE',
    portugal: 'PT',
    'reino unido': 'GB',
    taiwan: 'TW',
    tailandia: 'TH',
    turquia: 'TR',
    uruguay: 'UY',
    vietnam: 'VN',
};

const sinTildes = (t) =>
    String(t ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .trim();

export const paisConCodigo = (pais) => {
    const nombre = String(pais ?? '').trim();
    if (!nombre) return '';
    const codigo = CODIGOS[sinTildes(nombre)];
    return codigo ? `${nombre.toUpperCase()} - ${codigo}` : nombre.toUpperCase();
};
