import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { AppLayout } from './components/AppLayout';
import { ToastProvider } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { GapsPage } from './pages/GapsPage';
import { OcupacionPage } from './pages/OcupacionPage';
import { VacationsPage } from './pages/VacationsPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { Mobile4Page } from './pages/Mobile4Page';
import { Ruta36Page } from './pages/Ruta36Page';
import { AdministrationPage } from './pages/AdministrationPage';
import { CuadraturaPage } from './pages/CuadraturaPage';

function RedirectToInspectores({ vista }: { vista: 'ideal' | 'real' }) {
  const [params] = useSearchParams();
  const q = new URLSearchParams(params);
  q.set('vista', vista);
  return <Navigate to={{ pathname: '/inspectores', search: q.toString() }} replace />;
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/inspectores" replace />} />
                <Route path="/inspectores" element={<CuadraturaPage />} />
                <Route path="/ideal" element={<RedirectToInspectores vista="ideal" />} />
                <Route path="/real" element={<RedirectToInspectores vista="real" />} />
                <Route path="/cuadratura" element={<Navigate to="/inspectores" replace />} />
                <Route path="/cronograma-planificado" element={<RedirectToInspectores vista="ideal" />} />
                <Route path="/cronograma-real" element={<RedirectToInspectores vista="real" />} />
                <Route path="/calendario" element={<Navigate to="/inspectores" replace />} />
                <Route path="/proyeccion" element={<Navigate to="/inspectores" replace />} />
                <Route path="/huecos" element={<GapsPage />} />
                <Route path="/ocupacion" element={<OcupacionPage />} />
                <Route path="/vacaciones" element={<VacationsPage />} />
                <Route path="/aprobacion" element={<ApprovalPage />} />
                <Route path="/movil4" element={<Mobile4Page />} />
                <Route path="/ruta36" element={<Ruta36Page />} />
                <Route path="/administracion" element={<AdministrationPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/inspectores" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
