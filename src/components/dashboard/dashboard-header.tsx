"use client";

import { LogOut, User as UserIcon, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { hasRole, isAccountActivated } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardHeaderProps {
  onProfileClick?: () => void;
}

export function DashboardHeader({ onProfileClick }: DashboardHeaderProps) {
  const { signOut, userProfile } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const handleProfileClick = () => {
    if (onProfileClick) {
      onProfileClick();
    } else {
      window.dispatchEvent(new Event("toggle-profile"));
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const getAvatarSrc = () => {
    if (userProfile?.profilePictureUrl) {
      return userProfile.profilePictureUrl;
    }
    if (userProfile?.email) {
      return `https://avatar.vercel.sh/${encodeURIComponent(userProfile.email)}.png`;
    }
    return undefined;
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border/40 bg-white px-3 sm:gap-4 sm:px-4 lg:px-6">
      <SidebarTrigger className="-ml-1 shrink-0" />

      <div className="flex flex-1 items-center justify-between gap-2 overflow-hidden sm:justify-end sm:gap-4">
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden flex-col items-end sm:flex">
            <span className="text-sm font-medium">{userProfile?.name}</span>
            <span className="text-xs text-muted-foreground">
              User{userProfile?.clientId ? ` · #${userProfile.clientId}` : ""}
              {hasRole(userProfile, "user") && isAccountActivated(userProfile) && (
                <Badge variant="outline" className="ml-2 border-green-500/50 bg-green-50 text-green-700 text-[10px] px-1.5 py-0">
                  <CheckCircle className="h-3 w-3 mr-0.5" />
                  Active
                </Badge>
              )}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full sm:h-10 sm:w-10">
                <Avatar className="h-9 w-9 border-2 border-border sm:h-10 sm:w-10">
                  <AvatarImage
                    src={getAvatarSrc()}
                    alt={userProfile?.name || "User"}
                  />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white">
                    {getInitials(userProfile?.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{userProfile?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {userProfile?.email}
                  </p>
                  {userProfile?.clientId && (
                    <p className="text-xs leading-none text-muted-foreground pt-0.5">
                      Client ID: <span className="font-medium text-foreground">#{userProfile.clientId}</span>
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleProfileClick} className="cursor-pointer">
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-red-600 focus:text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
