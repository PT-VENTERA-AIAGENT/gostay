import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/lib/i18n";
import ProtectedRoute from "@/components/shared/ProtectedRoute";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { isAppHost, isLandingHost, appHref } from "@/lib/site";

import StaffLayout from "./components/layout/StaffLayout";
import PortalLayout from "./components/layout/PortalLayout";

import LandingPage from "./pages/LandingPage";
import Index from "./pages/Index";
import Bookings from "./pages/Bookings";
import BookingDetail from "./pages/BookingDetail";
import Pos from "./pages/Pos";
import Saldo from "./pages/Saldo";
import NewBooking from "./pages/NewBooking";
import Rooms from "./pages/Rooms";
import RoomTypes from "./pages/RoomTypes";
import RoomTypeDetail from "./pages/RoomTypeDetail";
import Chat from "./pages/Chat";
import CallLogs from "./pages/CallLogs";
import NewCallLog from "./pages/NewCallLog";
import GuestRequests from "./pages/GuestRequests";
import Analytics from "./pages/Analytics";
import UserManagement from "./pages/UserManagement";
import AddHotel from "./pages/admin/AddHotel";
import CreateHotel from "./pages/CreateHotel";
import LeadList from "./pages/admin/LeadList";
import PlatformLayout from "./components/layout/PlatformLayout";
import PlatformOverview from "./pages/platform/Overview";
import PlatformHotels from "./pages/platform/Hotels";
import PlatformReservations from "./pages/platform/Reservations";
import PlatformGuestRequests from "./pages/platform/GuestRequests";
import LeadDetail from "./pages/admin/LeadDetail";
import CampaignsPage from "./pages/admin/Campaigns";
import CRM from "./pages/CRM";
import Reviews from "./pages/Reviews";
import WhatsApp from "./pages/settings/WhatsApp";
import HotelProfile from "./pages/settings/HotelProfile";

import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";

import PortalHome from "./pages/portal/PortalHome";
import PortalRoomDetail from "./pages/portal/PortalRoomDetail";
import BookingDetails from "./pages/portal/BookingDetails";
import BookingReview from "./pages/portal/BookingReview";
import BookingConfirmation from "./pages/portal/BookingConfirmation";
import MyAccount from "./pages/portal/MyAccount";
import PortalBookingDetail from "./pages/portal/PortalBookingDetail";
import PortalProfile from "./pages/portal/PortalProfile";
import PortalChat from "./pages/portal/PortalChat";
import PortalOrder from "./pages/portal/PortalOrder";
import PortalFloorPlan from "./pages/portal/PortalFloorPlan";

import NotFound from "./pages/NotFound";

import { PromoPopup } from "./components/PromoPopup";
import { ExitIntentPopup } from "./components/ExitIntentPopup";

/** Leave this SPA for another origin (landing → app domain). */
function ExternalRedirect({ to }: { to: string }) {
  if (typeof window !== "undefined") window.location.replace(to);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const App = () => (
  <ErrorBoundary boundary="app">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LanguageProvider>
        <AuthProvider>
          <ErrorBoundary boundary="routes">
          <Routes>
            {/* Root: the app domain (app.gostay.id) is the application, so its "/"
                goes straight to login (which forwards signed-in users to their
                home); every other host shows the marketing landing page. */}
            <Route path="/" element={isAppHost() ? <Navigate to="/login" replace /> : <LandingPage />} />

            {/* Auth pages (no layout, no auth required). On the landing domain,
                login belongs on the app domain — send the user there rather than
                running an SSO exchange the landing deployment isn't configured for. */}
            <Route path="/login" element={isLandingHost() ? <ExternalRedirect to={appHref("/login")} /> : <Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Ventera SSO owns registration and passwords — GoStay never sees
                a password and cannot create an identity. Both pages posted to
                AuthContext stubs that always returned "Use SSO login", so they
                could only ever fail. Kept as redirects rather than deleted:
                they are linked from the wild and from old emails. */}
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/login" replace />} />

            {/* Self-serve hotel creation: any signed-in user (no hotel yet) can
                register their own hotel and become its owner (staff). Standalone
                — no staff layout, since the caller may still be a customer. */}
            <Route
              path="/create-hotel"
              element={
                <ProtectedRoute>
                  <CreateHotel />
                </ProtectedRoute>
              }
            />

            {/* Staff/Admin pages — require authentication */}
            <Route
              element={
                <ProtectedRoute allowedRoles={["admin", "staff"]}>
                  <StaffLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Index />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/bookings/new" element={<NewBooking />} />
              <Route path="/bookings/:id" element={<BookingDetail />} />
              <Route path="/rooms" element={<Rooms />} />
              <Route path="/rooms/types" element={<RoomTypes />} />
              <Route path="/rooms/types/:id" element={<RoomTypeDetail />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/calls" element={<CallLogs />} />
              <Route path="/calls/new" element={<NewCallLog />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/requests"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <GuestRequests />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pos"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <Pos />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/crm"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <CRM />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/saldo"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <Saldo />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/whatsapp"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <WhatsApp />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/hotel"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <HotelProfile />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Ventera Platform console — super-admin only, cross-hotel. A
                SEPARATE shell (PlatformLayout) so it never mixes with a single
                hotel's dashboard. */}
            <Route
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <PlatformLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/platform" element={<PlatformOverview />} />
              <Route path="/platform/hotels" element={<PlatformHotels />} />
              <Route path="/platform/reservations" element={<PlatformReservations />} />
              <Route path="/platform/requests" element={<PlatformGuestRequests />} />
              <Route path="/admin/add-hotel" element={<AddHotel />} />
              <Route path="/admin/leads" element={<LeadList />} />
              <Route path="/admin/leads/:id" element={<LeadDetail />} />
              <Route path="/admin/campaigns" element={<CampaignsPage />} />
            </Route>
            {/* Old payment-control path now lives in the platform console */}
            <Route path="/admin/payments" element={<Navigate to="/platform/hotels" replace />} />

            {/* Customer Portal — public (no auth required to browse) */}
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<PortalHome />} />
              <Route path="denah" element={<PortalFloorPlan />} />
              <Route path="rooms/:slug" element={<PortalRoomDetail />} />
              <Route path="book/details" element={<BookingDetails />} />
              <Route path="book/review" element={<BookingReview />} />
              <Route path="book/confirmation" element={<BookingConfirmation />} />
              <Route
                path="my-account"
                element={
                  <ProtectedRoute>
                    <MyAccount />
                  </ProtectedRoute>
                }
              />
              <Route
                path="my-account/bookings/:id"
                element={
                  <ProtectedRoute>
                    <PortalBookingDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="profile"
                element={
                  <ProtectedRoute>
                    <PortalProfile />
                  </ProtectedRoute>
                }
              />
              <Route path="chat" element={<PortalChat />} />
              <Route path="order" element={<PortalOrder />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
          <PromoPopup />
          <ExitIntentPopup />
        </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
