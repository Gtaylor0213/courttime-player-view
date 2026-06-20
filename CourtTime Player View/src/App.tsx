import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AppProvider } from './contexts/AppContext';
import { Toaster } from './components/ui/sonner';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthenticatedLayout } from './components/AuthenticatedLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

// Auth pages (public)
import { LoginPage } from './components/LoginPage';
import { UserRegistration } from './components/UserRegistration';
import { FacilityRegistration } from './components/FacilityRegistration';
import { ForgotPassword } from './components/ForgotPassword';
import { ResetPassword } from './components/ResetPassword';
import { AboutPage } from './components/AboutPage';

// Player pages
import { CourtCalendarView } from './components/CourtCalendarView';
import { PlayerProfile } from './components/PlayerProfile';
import { QuickReservation } from './components/QuickReservation';
import { ClubInfo } from './components/ClubInfo';
import { BulletinBoard } from './components/BulletinBoard';
import { FindHittingPartner } from './components/FindHittingPartner';
import { MessagesPage } from './components/MessagesPage';
import { MemberPayments } from './components/MemberPayments';
import { PaymentSuccess } from './components/PaymentSuccess';
import { LockoutPaid } from './components/LockoutPaid';

// Admin pages
import { AdminDashboard } from './components/admin/AdminDashboard';
import { FacilityManagement } from './components/admin/FacilityManagement';
import { CourtManagement } from './components/admin/CourtManagement';
import { BookingManagement } from './components/admin/BookingManagement';
import { AdminBooking } from './components/admin/AdminBooking';
import { MemberManagement } from './components/admin/MemberManagement';
import { HouseholdManagement } from './components/admin/HouseholdManagement';
import { AdminCommunication } from './components/admin/AdminCommunication';
import { AdminMemberPayments } from './components/admin/AdminMemberPayments';
import ProShopAdmin from './components/admin/ProShopAdmin';
import ProShop from './components/ProShop';
import AnnualFeesAdmin from './components/admin/AnnualFeesAdmin';

// Support Console
import { SupportConsole } from './components/developer';

// Legal pages (public, no auth)
import { PrivacyPolicyPage } from './components/legal/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/legal/TermsOfServicePage';
import { AccountDeletionPage } from './components/legal/AccountDeletionPage';
import { SupportPage } from './components/legal/SupportPage';

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <NotificationProvider>
        <AppProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/about" element={<AboutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<UserRegistration />} />
            <Route path="/register/facility" element={<FacilityRegistration />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Legal pages — required public URLs for App Store / Play Store submission */}
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/delete-account" element={<AccountDeletionPage />} />
            <Route path="/support" element={<SupportPage />} />

            {/* Support Console route - bypasses auth */}
            <Route path="/developer/*" element={<SupportConsole />} />

            {/* Protected routes with sidebar layout */}
            <Route element={
              <ProtectedRoute>
                <AuthenticatedLayout />
              </ProtectedRoute>
            }>
              <Route path="/calendar" element={<CourtCalendarView />} />
              <Route path="/profile" element={<PlayerProfile />} />
              <Route path="/quick-reservation" element={<QuickReservation />} />
              <Route path="/club/:clubId" element={<ClubInfo />} />
              <Route path="/bulletin-board" element={<BulletinBoard />} />
              <Route path="/hitting-partner" element={<FindHittingPartner />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/payments" element={<MemberPayments />} />
              <Route path="/payments/success" element={<PaymentSuccess />} />
              <Route path="/lockout-paid" element={<LockoutPaid />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/facilities" element={<FacilityManagement />} />
              <Route path="/admin/courts" element={<CourtManagement />} />
              <Route path="/admin/bookings" element={<BookingManagement />} />
              <Route path="/admin/booking" element={<AdminBooking />} />
              <Route path="/admin/members" element={<MemberManagement />} />
              <Route path="/admin/households" element={<HouseholdManagement />} />
              <Route path="/admin/communication" element={<AdminCommunication />} />
              <Route path="/admin/member-payments" element={<AdminMemberPayments />} />
              <Route path="/admin/pro-shop" element={<ProShopAdmin />} />
              <Route path="/admin/annual-fees" element={<AnnualFeesAdmin />} />
              <Route path="/shop" element={<ProShop />} />
              <Route path="/admin/email-blast" element={<Navigate to="/admin/communication" replace />} />
            </Route>

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/calendar" replace />} />
            <Route path="*" element={<Navigate to="/calendar" replace />} />
          </Routes>
          <Toaster />
        </AppProvider>
      </NotificationProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}
