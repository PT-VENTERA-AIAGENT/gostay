import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/shared/ProtectedRoute";

import StaffLayout from "./components/layout/StaffLayout";
import PortalLayout from "./components/layout/PortalLayout";

import LandingPage from "./pages/LandingPage";
import Index from "./pages/Index";
import Bookings from "./pages/Bookings";
import BookingDetail from "./pages/BookingDetail";
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
import CRM from "./pages/CRM";
import Reviews from "./pages/Reviews";
import WhatsApp from "./pages/settings/WhatsApp";

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

import NotFound from "./pages/NotFound";

import { PromoPopup } from "./components/PromoPopup";
import { ExitIntentPopup } from "./components/ExitIntentPopup";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            {/* Public landing page */}
            <Route path="/" element={<LandingPage />} />

            {/* Auth pages (no layout, no auth required) */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Ventera SSO owns registration and passwords — GoStay never sees
                a password and cannot create an identity. Both pages posted to
                AuthContext stubs that always returned "Use SSO login", so they
                could only ever fail. Kept as redirects rather than deleted:
                they are linked from the wild and from old emails. */}
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/login" replace />} />

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
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/add-hotel"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AddHotel />
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
                path="/crm"
                element={
                  <ProtectedRoute allowedRoles={["admin", "staff"]}>
                    <CRM />
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
            </Route>

            {/* Customer Portal — public (no auth required to browse) */}
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<PortalHome />} />
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
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <PromoPopup />
          <ExitIntentPopup />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
