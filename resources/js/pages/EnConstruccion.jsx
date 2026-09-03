import { Link, useLocation } from 'react-router-dom';
import { Construction, ArrowLeft } from 'lucide-react';
import Layout from '../components/Layout';
import { Button } from '../components/ui';

export default function EnConstruccion() {
    const location = useLocation();

    return (
        <Layout>
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
                    <Construction className="h-8 w-8" />
                </div>
                <h1 className="text-xl font-bold text-warm-900">Página en construcción</h1>
                <p className="mt-1 max-w-md text-sm text-warm-500">
                    Este módulo aún no está disponible.
                    {location.pathname && (
                        <>
                            {' '}
                            <span className="font-mono text-gray-400">{location.pathname}</span>
                        </>
                    )}
                </p>
                <Link to="/dashboard" className="mt-6">
                    <Button variant="secondary">
                        <ArrowLeft className="h-4 w-4" />
                        Volver al inicio
                    </Button>
                </Link>
            </div>
        </Layout>
    );
}
