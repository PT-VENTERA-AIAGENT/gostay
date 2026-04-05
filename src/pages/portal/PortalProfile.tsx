import { Link } from "react-router-dom";
import { ArrowLeft, User, Mail, Phone, Lock, Save, Camera } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";

export default function PortalProfile() {
  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
        <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <div><h1 className="text-xl md:text-2xl font-bold text-foreground">Profile Settings</h1><p className="text-sm text-muted-foreground mt-1">Manage your personal information</p></div>
        <div className="flex items-center gap-4"><div className="relative"><div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/20 flex items-center justify-center text-xl md:text-2xl font-bold text-primary">JD</div><button className="absolute -bottom-1 -right-1 w-7 h-7 md:w-8 md:h-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><Camera className="w-3.5 h-3.5 md:w-4 md:h-4" /></button></div><div><p className="font-semibold text-foreground">John Doe</p><p className="text-sm text-muted-foreground">Member since March 2026</p></div></div>
        <div className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Personal Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">First Name</label><div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="text" defaultValue="John" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">Last Name</label><input type="text" defaultValue="Doe" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
          </div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Email</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="email" defaultValue="john@example.com" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Phone</label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="tel" defaultValue="+62 812 3456 7890" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
          <div className="flex justify-end"><button className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"><Save className="w-4 h-4" /> Save Changes</button></div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 md:p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Change Password</h2>
          <div><label className="text-sm font-medium text-foreground mb-1.5 block">Current Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="password" placeholder="••••••••" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">New Password</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="password" placeholder="Min. 8 characters" className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div></div>
            <div><label className="text-sm font-medium text-foreground mb-1.5 block">Confirm</label><input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" /></div>
          </div>
          <div className="flex justify-end"><button className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"><Lock className="w-4 h-4" /> Update Password</button></div>
        </div>
        <div className="bg-card rounded-xl border border-destructive/30 p-4 md:p-6"><h2 className="font-semibold text-destructive mb-2">Danger Zone</h2><p className="text-sm text-muted-foreground mb-4">Permanently delete your account. This cannot be undone.</p><button className="px-4 py-2.5 rounded-lg border border-destructive text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">Delete Account</button></div>
      </div>
    </PageTransition>
  );
}
