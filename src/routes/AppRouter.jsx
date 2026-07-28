import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ProtectedRoute from './ProtectedRoute'
import PublicRoute from './PublicRoute'

const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage'))
const LoginPage = lazy(() => import('../pages/LoginPage'))
const PatientsPage = lazy(() => import('../pages/PatientsPage'))
const PrivateAreaPage = lazy(() => import('../pages/PrivateAreaPage'))
const RegisterPage = lazy(() => import('../pages/RegisterPage'))
const AgendaPage = lazy(() => import('../pages/AgendaPage'))
const ReportPrintPage = lazy(() => import('../pages/ReportPrintPage'))
const GuidePage = lazy(() => import('../pages/GuidePage'))
const AuditPage = lazy(() => import('../pages/AuditPage'))

function AppRouter() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/cadastro"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />
      <Route
        path="/recuperar-senha"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />

      <Route
        path="/imprimir/paciente/:id"
        element={
          <ProtectedRoute>
            <ReportPrintPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <PrivateAreaPage />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="pacientes" element={<PatientsPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="guia" element={<GuidePage />} />
        <Route path="auditoria" element={<AuditPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default AppRouter
