import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { AppLayout } from './components/AppLayout';
import { ToastProvider } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { CalendarPage } from './pages/CalendarPage';
import { GapsPage } from './pages/GapsPage';
import { VacationsPage } from './pages/VacationsPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { Mobile4Page } from './pages/Mobile4Page';
import { Ruta36Page } from './pages/Ruta36Page';
import { AdministrationPage } from './pages/AdministrationPage';
import { ProjectionPage } from './pages/ProjectionPage';

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/cronograma-planificado" element={<CalendarPage layer="planned" />} />
                <Route path="/cronograma-real" element={<CalendarPage layer="real" />} />
                <Route path="/calendario" element={<Navigate to="/cronograma-planificado" replace />} />
                <Route path="/proyeccion" element={<ProjectionPage />} />
                <Route path="/huecos" element={<GapsPage />} />
                <Route path="/vacaciones" element={<VacationsPage />} />
                <Route path="/aprobacion" element={<ApprovalPage />} />
                <Route path="/movil4" element={<Mobile4Page />} />
                <Route path="/ruta36" element={<Ruta36Page />} />
                <Route path="/administracion" element={<AdministrationPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
