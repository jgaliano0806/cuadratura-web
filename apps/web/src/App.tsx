import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { InitializationPage } from './pages/InitializationPage';
import { CalendarPage } from './pages/CalendarPage';
import { GapsPage } from './pages/GapsPage';
import { VacationsPage } from './pages/VacationsPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { Mobile4Page } from './pages/Mobile4Page';
import { AdministrationPage } from './pages/AdministrationPage';
import { ProjectionPage } from './pages/ProjectionPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/inicializacion" element={<InitializationPage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/proyeccion" element={<ProjectionPage />} />
            <Route path="/huecos" element={<GapsPage />} />
            <Route path="/vacaciones" element={<VacationsPage />} />
            <Route path="/aprobacion" element={<ApprovalPage />} />
            <Route path="/movil4" element={<Mobile4Page />} />
            <Route path="/administracion" element={<AdministrationPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
