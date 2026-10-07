import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button, Input, Alert } from '../components/ui';
import CreditoMagus from '../components/CreditoMagus';
import CintaMetrica from '../components/CintaMetrica';
import { useAuth } from '../lib/auth';
import api from '../lib/api';

const REMEMBER_KEY = 'brava_remember';

// La esterilla de corte: cuadrícula fina cada 24 px y una marcada cada 120 px, en blanco sobre el azul de la marca.
const ESTERILLA = {
    backgroundImage: [
        'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)',
        'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
        'linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
    ].join(','),
    backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
};

function EyeIcon({ open }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            className="h-5 w-5"
        >
            {open ? (
                <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                </>
            ) : (
                <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </>
            )}
        </svg>
    );
}

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [branding, setBranding] = useState(null);
    useEffect(() => {
        api.get('/branding')
            .then((res) => setBranding(res.data))
            .catch(() => {});
    }, []);

    const [form, setForm] = useState(() => {
        const saved = localStorage.getItem(REMEMBER_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                /* ignore */
            }
        }
        return { email: '', password: '' };
    });
    const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)));
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState(null);
    const [loading, setLoading] = useState(false);

    const from = location.state?.from?.pathname || '/';

    useEffect(() => {
        if (remember) {
            localStorage.setItem(REMEMBER_KEY, JSON.stringify(form));
        } else {
            localStorage.removeItem(REMEMBER_KEY);
        }
    }, [form, remember]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: undefined }));
        }
        setFormError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setFormError(null);

        const newErrors = {};
        if (!form.email.trim()) newErrors.email = 'El correo es obligatorio';
        if (!form.password) newErrors.password = 'La contraseña es obligatoria';

        if (Object.keys(newErrors).length) {
            setErrors(newErrors);
            setLoading(false);
            return;
        }

        try {
            await login(form.email.trim(), form.password);
            navigate(from, { replace: true });
        } catch (err) {
            const status = err.response?.status;
            if (status === 401) {
                setFormError('Credenciales inválidas. Verifica tu correo y contraseña.');
            } else if (status === 422) {
                const validation = err.response.data?.errors ?? {};
                setErrors(Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])));
            } else {
                setFormError('No se pudo conectar con el servidor. Inténtalo de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Cada campo lleno avanza el marcador de la cinta; un error lo pone en rojo y lo deja ahí.
    const llenos = (form.email.trim() ? 1 : 0) + (form.password ? 1 : 0);
    const hayError = Boolean(formError) || Object.values(errors).some(Boolean);

    return (
        <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
            {/* La esterilla de corte (escritorio): cuadrícula fina sobre el azul de la marca y la cinta métrica. */}
            <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary-800 text-white lg:flex" style={ESTERILLA}>
                <div className="p-12 xl:p-16">
                    <h2 className="max-w-md text-balance text-4xl font-semibold leading-[1.1] tracking-tight xl:text-5xl">
                        Telas, rollo por rollo.
                    </h2>
                    <p className="mt-5 max-w-sm text-base leading-relaxed text-primary-100">
                        Compras, inventario, despacho y caja del negocio, en un solo lugar.
                    </p>
                </div>

                <div>
                    <CintaMetrica progreso={llenos / 2} error={hayError} />
                    <div className="p-12 pt-8 xl:px-16 xl:pb-14">
                        <CreditoMagus variante="bloque" />
                    </div>
                </div>
            </aside>

            <main className="flex min-h-screen flex-col lg:min-h-0">
                {/* En celular la cinta va arriba, del ancho de la pantalla. */}
                <CintaMetrica className="lg:hidden" progreso={llenos / 2} error={hayError} />

                <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
                    <div className="w-full max-w-sm">
                        <img
                            src={branding?.logo_url ?? '/img/logo-telas.svg'}
                            alt={branding?.nombre_comercial ?? 'Logo'}
                            className="h-16 w-auto object-contain"
                        />

                        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-warm-900">Ingresa a tu cuenta</h1>
                        <p className="mt-1.5 text-sm text-warm-500">Usa el correo y la contraseña de tu usuario del sistema.</p>

                        {formError && (
                            <Alert variant="error" className="mt-6">
                                {formError}
                            </Alert>
                        )}

                        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                            <Input
                                label="Correo electrónico"
                                name="email"
                                type="email"
                                autoComplete="email"
                                placeholder="tucorreo@empresa.com"
                                value={form.email}
                                onChange={handleChange}
                                error={errors.email}
                            />

                            <div className="relative">
                                <Input
                                    label="Contraseña"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete={showPassword ? 'off' : 'current-password'}
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={handleChange}
                                    error={errors.password}
                                    className="pr-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                                    aria-pressed={showPassword}
                                    className="absolute right-3 top-[38px] text-warm-500 transition hover:text-primary-600"
                                >
                                    <EyeIcon open={showPassword} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between gap-3 pt-1">
                                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-gray-600">
                                    <input
                                        type="checkbox"
                                        checked={remember}
                                        onChange={(e) => setRemember(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-primary-600 accent-primary-600 focus:ring-primary-500"
                                    />
                                    Recordar credenciales
                                </label>
                                <Link
                                    to="/recuperar"
                                    className="text-right text-sm font-medium text-primary-600 hover:text-primary-700"
                                >
                                    ¿Olvidaste tu contraseña?
                                </Link>
                            </div>

                            <Button type="submit" size="lg" loading={loading} className="w-full">
                                {loading ? 'Ingresando...' : 'Iniciar sesión'}
                            </Button>
                        </form>

                        {/* En escritorio la firma vive en la esterilla; aquí solo en celular y tablet. */}
                        <CreditoMagus variante="bloque" className="mt-10 lg:hidden" />
                    </div>
                </div>
            </main>
        </div>
    );
}
