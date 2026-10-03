import axios from 'axios';
import { leerAlmacenActivo } from './almacenActivo';

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export const asList = (response) =>
    Array.isArray(response.data) ? response.data : (response.data?.data ?? []);

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // El Super Admin trabaja en el almacén que eligió al entrar (el servidor lo ignora para los demás).
    const almacen = leerAlmacenActivo();
    if (almacen) {
        config.headers['X-Almacen-Id'] = almacen.id;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Falta el permiso: se avisa para que la interfaz ofrezca pedirlo. Ver es
        // distinto: si ni siquiera puede abrir la pantalla, eso lo resuelve la
        // pantalla bloqueada, no una ventana en cada consulta.
        const denegado = error.response?.status === 403 ? error.response.data : null;
        if (denegado?.permiso && denegado.accion && denegado.accion !== 'ver') {
            window.dispatchEvent(new CustomEvent('permiso-denegado', { detail: denegado }));
        }
        if (error.response?.status === 401 && !error.config?.url?.includes('/login')) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    },
);

export default api;
