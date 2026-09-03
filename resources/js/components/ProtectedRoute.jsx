import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-cream">
                <Spinner size="lg" className="text-primary-600" />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}
