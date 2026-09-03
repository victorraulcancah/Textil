import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button, Input, Alert } from '../components/ui';
import { useAuth } from '../lib/auth';

const REMEMBER_KEY = 'brava_remember';

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

    const from = location.state?.from?.pathname || '/dashboard';

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

    return (
        <div className="flex min-h-screen items-center justify-center bg-cream px-4 py-12">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <img
                        src="/images/brava-horizontal.png"
                        alt="BRAVA"
                        className="mx-auto h-20 w-auto drop-shadow-sm"
                    />
                    <p className="mt-4 text-sm text-warm-500">
                        Ingresa a tu cuenta para continuar
                    </p>
                </div>

                <div className="rounded-2xl border border-edge bg-white p-6 shadow-xl shadow-primary-600/5 sm:p-8">
                    {formError && (
                        <Alert variant="error" className="mb-4">
                            {formError}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

                        <div className="flex items-center justify-between pt-1">
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
                                className="text-sm font-medium text-primary-600 hover:text-primary-700"
                            >
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            loading={loading}
                            className="w-full"
                        >
                            {loading ? 'Ingresando...' : 'Iniciar sesión'}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-gray-500">
                        ¿No tienes cuenta?{' '}
                        <Link to="/registro" className="font-medium text-primary-600 hover:text-primary-700">
                            Regístrate
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
