import AppSidebar from "@/components/layout/AppSidebar";
import TopBar from "@/components/layout/TopBar";
import StatCards from "@/components/dashboard/StatCards";
import RoomAvailability from "@/components/dashboard/RoomAvailability";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ReservationsChart from "@/components/dashboard/ReservationsChart";
import BookingByPlatform from "@/components/dashboard/BookingByPlatform";
import BookingList from "@/components/dashboard/BookingList";
import OverallRating from "@/components/dashboard/OverallRating";
import TasksPanel from "@/components/dashboard/TasksPanel";
import RecentActivities from "@/components/dashboard/RecentActivities";

export default function Index() {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex flex-1 gap-6 p-6 overflow-auto">
          {/* Main content */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            <StatCards />
            <div className="grid grid-cols-5 gap-6">
              <div className="col-span-2">
                <RoomAvailability />
              </div>
              <div className="col-span-3">
                <RevenueChart />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <ReservationsChart />
              <BookingByPlatform />
            </div>
            <BookingList />
          </div>

          {/* Right sidebar */}
          <div className="w-72 shrink-0 flex flex-col gap-6">
            <OverallRating />
            <TasksPanel />
            <RecentActivities />
          </div>
        </div>
      </div>
    </div>
  );
}
