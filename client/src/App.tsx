import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'

import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'
import Layout from './components/layout/Layout'
import LoadingSpinner from './components/common/LoadingSpinner'
import ErrorBoundary from './components/common/ErrorBoundary'

// Lazy load pages for better performance
const HomePage = React.lazy(() => import('./pages/HomePage'))
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = React.lazy(() => import('./pages/auth/RegisterPage'))
const DashboardPage = React.lazy(() => import('./pages/dashboard/DashboardPage'))
const ProjectsPage = React.lazy(() => import('./pages/projects/ProjectsPage'))
const ProjectDetailPage = React.lazy(() => import('./pages/projects/ProjectDetailPage'))
const TasksPage = React.lazy(() => import('./pages/tasks/TasksPage'))
const TaskDetailPage = React.lazy(() => import('./pages/tasks/TaskDetailPage'))
const TeamPage = React.lazy(() => import('./pages/team/TeamPage'))
const CalendarPage = React.lazy(() => import('./pages/calendar/CalendarPage'))
const SettingsPage = React.lazy(() => import('./pages/settings/SettingsPage'))
const ProfilePage = React.lazy(() => import('./pages/profile/ProfilePage'))
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'))

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth()
  
  if (isLoading) {
    return <LoadingSpinner />
  }
  
  if (!user) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

// Public Route component (redirect to dashboard if logged in)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth()
  
  if (isLoading) {
    return <LoadingSpinner />
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />
  }
  
  return <>{children}</>
}

const App: React.FC = () => {
  const { theme } = useTheme()
  
  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
      <Helmet>
        <title>Studious Couscous - Project Management Platform</title>
        <meta name="description" content="Advanced project management platform with real-time collaboration" />
        <meta name="keywords" content="project management, collaboration, tasks, teams, productivity" />
        <meta name="author" content="Studious Couscous Team" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="canonical" href="https://studious-couscous.com" />
      </Helmet>
      
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            {/* Public routes */}
            <Route
              path="/"
              element={
                <PublicRoute>
                  <HomePage />
                </PublicRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <RegisterPage />
                </PublicRoute>
              }
            />
            
            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Layout>
                    <DashboardPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ProjectsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ProjectDetailPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute>
                  <Layout>
                    <TasksPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <TaskDetailPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute>
                  <Layout>
                    <TeamPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CalendarPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <SettingsPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ProfilePage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            
            {/* 404 page */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

export default App