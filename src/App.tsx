import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/shared/ProtectedRoute";

import StaffLayout from "./components/layout/StaffLayout";
import PortalLayout from "./components/layout/PortalLayout";

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
import Analytics from "./pages/Analytics";
import UserManagement from "./pages/UserManagement";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";

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
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Auth pages (no layout, no auth required) */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Staff/Admin pages — require authentication */}
            <Route
              element={
                <ProtectedRoute allowedRoles={["admin", "staff"]}>
                  <StaffLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Index />} />
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
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <UserManagement />
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
        </AuthProvider>
      </BrowserRouter>
      <PromoPopup />
      <ExitIntentPopup />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
