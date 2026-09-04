import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            setLoading(false);
            return;
        }
        api.get('/me')
            .then(({ data }) => {
                setUser(data);
                localStorage.setItem('user', JSON.stringify(data));
            })
            .catch(() => {
                localStorage.removeItem('access_token');
                localStorage.removeItem('user');
                setUser(null);
            })
            .finally(() => setLoading(false));
    }, []);

    const login = useCallback(async (email, password) => {
        const { data } = await api.post('/login', { email, password });
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await api.post('/logout');
        } finally {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            setUser(null);
        }
    }, []);

    /**
     * ¿El usuario tiene este permiso? Acepta el nombre completo
     * ("ventas.clientes.crear") o solo el submódulo ("ventas.clientes"), que
     * responde si puede verlo.
     */
    const puede = useCallback(
        (permiso) => {
            const lista = user?.permisos ?? [];
            if (!permiso) return true;
            return lista.includes(permiso.split('.').length === 2 ? `${permiso}.ver` : permiso);
        },
        [user],
    );

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, puede }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth debe usarse dentro de <AuthProvider>');
    }
    return ctx;
}
