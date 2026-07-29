import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/lib/i18n";

// Smoke coverage for every component the i18n sweep touched.
//
// The sweep wrapped hardcoded English in t() across twelve files and bound `t`
// in none of them. Only GlobalSearch was noticed, because it sits in the top bar
// of every route and so took the whole app down; the other eleven would each
// have thrown on their own page, quietly, until someone opened it.
//
// Neither tsc nor grep caught that — see GlobalSearch.test.tsx for why. Mounting
// the component is what catches it, so these mount the component.
//
// Deliberately shallow: no assertion on what any page displays, only that it
// renders. Depth here would mean mocking each page's data layer faithfully, and
// would rot; the one failure mode this must never miss is a render that throws.

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    signIn: () => {},
    signOut: () => {},
    refreshSession: async () => {},
  }),
  useSsoAuth: () => ({ refreshSession: async () => {}, loading: false }),
  roleHome: () => "/",
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/services/bookingService", () => ({
  createBooking: vi.fn(async () => ({})),
  getOrCreateOwnCustomer: vi.fn(async () => ({})),
  getBookings: vi.fn(async () => []),
  searchCustomers: vi.fn(async () => []),
}));

vi.mock("@/services/roomService", () => ({
  getAvailableRooms: vi.fn(async () => []),
  getRoomTypes: vi.fn(async () => []),
}));

// vi.hoisted, because vi.mock calls are lifted above ordinary declarations and
// would otherwise read this before it exists.
const { stubModule } = vi.hoisted(() => {
  // Stands in for both a query and a mutation, so one shape covers every hook.
  const HOOK_RESULT = {
    data: [],
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    mutate: () => {},
    mutateAsync: async () => ({}),
    refetch: () => {},
  };

  // Mirror the real module's export list rather than naming hooks by hand: a
  // hook added later is stubbed automatically instead of failing this file with
  // "no such export", which is noise about the mock rather than about the page.
  return {
    stubModule: async (importOriginal: () => Promise<Record<string, unknown>>) => {
      const actual = await importOriginal();
      return Object.fromEntries(Object.keys(actual).map((k) => [k, () => HOOK_RESULT]));
    },
  };
});

vi.mock("@/hooks/useRooms", stubModule);
vi.mock("@/hooks/useBookings", stubModule);

function mount(Component: React.ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <MemoryRouter>
          <Component />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

// Loaded lazily inside each test so one module that fails to import cannot stop
// the rest of the file from running.
const PAGES: Array<[string, () => Promise<{ default: React.ComponentType }>]> = [
  ["NotFound", () => import("./NotFound")],
  ["NewCallLog", () => import("./NewCallLog")],
  ["RoomTypeDetail", () => import("./RoomTypeDetail")],
  ["Campaigns", () => import("./admin/Campaigns")],
  ["BookingConfirmation", () => import("./portal/BookingConfirmation")],
  ["BookingDetails", () => import("./portal/BookingDetails")],
  ["BookingReview", () => import("./portal/BookingReview")],
  ["PortalBookingDetail", () => import("./portal/PortalBookingDetail")],
  ["PortalRoomDetail", () => import("./portal/PortalRoomDetail")],
  ["ChatWidget", () => import("../components/portal/ChatWidget")],
  ["QuickWalkIn", () => import("../components/bookings/QuickWalkIn")],

  // Second sweep: files where hardcoded text was wrapped in t(). LandingPage
  // matters most — it is the public page, and it holds ~25 components, so its
  // binding had to be inserted 16 times rather than once.
  ["LandingPage", () => import("./LandingPage")],
  ["Login", () => import("./Login")],
  ["CreateHotel", () => import("./CreateHotel")],
  ["AuthCallback", () => import("./AuthCallback")],
  ["LanguageToggle", () => import("../components/shared/LanguageToggle")],
  ["ErrorBoundary", () => import("../components/shared/ErrorBoundary")],
  ["NotificationsMenu", () => import("../components/layout/NotificationsMenu")],
  ["BookingReviewForm", () => import("../components/portal/BookingReviewForm")],
  ["PortalFloorPlan", () => import("./portal/PortalFloorPlan")],

  // Third sweep: platform console, settings and admin. Several of these declare
  // sub-components below the default export, and a binding in the page component
  // does not reach them — WhatsApp.tsx had three such sub-components whose calls
  // sat outside every binding.
  ["PlatformOverview", () => import("./platform/Overview")],
  ["PlatformHotels", () => import("./platform/Hotels")],
  ["PlatformReservations", () => import("./platform/Reservations")],
  ["PlatformGuestRequests", () => import("./platform/GuestRequests")],
  ["WaFlows", () => import("./settings/WaFlows")],
  ["Knowledge", () => import("./settings/Knowledge")],
  ["SettingsWhatsApp", () => import("./settings/WhatsApp")],
  ["AdminLeadList", () => import("./admin/LeadList")],
  // Named exports rather than default, so they are adapted to the same shape.
  ["ExitIntentPopup", () => import("../components/ExitIntentPopup").then((m) => ({ default: m.ExitIntentPopup }))],
  ["PromoPopup", () => import("../components/PromoPopup").then((m) => ({ default: m.PromoPopup }))],
];

describe("i18n sweep — every touched component renders", () => {
  for (const [name, load] of PAGES) {
    it(`${name} mounts without an unbound t()`, async () => {
      const { default: Component } = await load();
      expect(() => mount(Component)).not.toThrow();
    });
  }
});
