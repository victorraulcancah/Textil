// Puente entre la paleta de marca (resources/css/app.css, bloque @theme) y el
// JS que la necesita como valor literal (Recharts no acepta clases de Tailwind).
// No declares colores aquí a mano: este archivo solo LEE las variables CSS, así
// que la única fuente de color sigue siendo app.css.

const read = (name, fallback) => {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
};

export const colors = {
    primary50: read('--color-primary-50', '#fff3e0'),
    primary400: read('--color-primary-400', '#ffa726'),
    primary500: read('--color-primary-500', '#fb8c00'),
    primary600: read('--color-primary-600', '#ef6c00'),
    primary700: read('--color-primary-700', '#e65100'),
    primary900: read('--color-primary-900', '#bf360c'),
    warm500: read('--color-warm-500', '#a9866a'),
    warm900: read('--color-warm-900', '#5d2e00'),
    edge: read('--color-edge', '#e0dad2'),
    success: read('--color-success-600', '#16a34a'),
    danger: read('--color-danger-600', '#dc2626'),
    warning: read('--color-warning-500', '#f59e0b'),
    info: read('--color-info-600', '#2563eb'),
    chartGrid: read('--color-chart-grid', '#f0ece6'),
};

// Paleta para series/categorías (pie, barras apiladas, etc.).
export const CAT_COLORS = [
    colors.primary600,
    colors.primary500,
    colors.primary400,
    '#8d6e63',
    colors.warm900,
    colors.warm500,
    colors.primary700,
    colors.primary900,
];

export const tooltipStyle = {
    borderRadius: 12,
    border: `1px solid ${colors.edge}`,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,.08)',
};
