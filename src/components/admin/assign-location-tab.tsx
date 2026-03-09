"use client";

import { useState, useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatUserDisplayName } from "@/lib/format-user-display";
import { useCollection } from "@/hooks/use-collection";
import { createLocation, removeLocation } from "@/lib/locations";
import type { Location as LocationType, UserProfile } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

type LocationDoc = { id: string; name?: string; active?: boolean };

export function AssignLocationTab() {
  const { toast } = useToast();
  const { data: locationDocs, loading: locationsLoading } = useCollection<LocationDoc>("locations");
  const { data: users } = useCollection<UserProfile>("users");

  const [newLocationName, setNewLocationName] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());

  const activeLocations = useMemo(
    () =>
      locationDocs
        .filter((l) => l.active !== false)
        .map((l) => ({ id: l.id, name: l.name ?? "", active: true } as LocationType)),
    [locationDocs]
  );

  const assignableUsers = useMemo(
    () =>
      users
        .filter((u) => u.uid && u.status !== "deleted")
        .sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "")),
    [users]
  );

  const handleAddLocation = async () => {
    const name = newLocationName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Error", description: "Enter a location name." });
      return;
    }
    setAdding(true);
    try {
      await createLocation(name);
      setNewLocationName("");
      toast({ title: "Success", description: `Location "${name}" added.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: (e as Error).message });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveLocation = async (id: string) => {
    setConfirmRemoveId(null);
    setRemovingId(id);
    try {
      await removeLocation(id);
      toast({ title: "Success", description: "Location removed." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: (e as Error).message });
    } finally {
      setRemovingId(null);
    }
  };

  const toggleUser = (uid: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleLocation = (id: string) => {
    setSelectedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssignLocationsToUsers = async () => {
    if (selectedUserIds.size === 0 || selectedLocationIds.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Select at least one user and one location.",
      });
      return;
    }
    setAssigning(true);
    try {
      const locationIds = Array.from(selectedLocationIds);
      for (const uid of selectedUserIds) {
        const user = users.find((u) => u.uid === uid);
        const current = user?.locations ?? [];
        const merged = Array.from(new Set([...current, ...locationIds]));
        await updateDoc(doc(db, "users", uid), { locations: merged });
      }
      setSelectedUserIds(new Set());
      setSelectedLocationIds(new Set());
      toast({ title: "Success", description: "Locations assigned to selected users." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: (e as Error).message });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Active locations
          </CardTitle>
          <CardDescription>
            Add or remove locations. Then assign locations to users below so sub admins can scope by location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="New location name"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              className="max-w-xs"
              onKeyDown={(e) => e.key === "Enter" && handleAddLocation()}
            />
            <Button onClick={handleAddLocation} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">Add location</span>
            </Button>
          </div>
          {locationsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading locations…
            </div>
          ) : activeLocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active locations. Add one above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeLocations.map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <span className="font-medium">{loc.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemoveId(loc.id)}
                    disabled={removingId === loc.id}
                  >
                    {removingId === loc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign locations to users</CardTitle>
          <CardDescription>
            Select users and locations, then click Assign. Selected locations will be added to each user&apos;s
            location list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {activeLocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add at least one location first.</p>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <Label className="text-sm font-medium">Users</Label>
                  <ScrollArea className="h-[200px] rounded-md border p-3 mt-1">
                    <div className="space-y-2">
                      {assignableUsers.map((u) => (
                        <div key={u.uid} className="flex items-center space-x-2">
                          <Checkbox
                            id={`user-${u.uid}`}
                            checked={selectedUserIds.has(u.uid!)}
                            onCheckedChange={() => toggleUser(u.uid!)}
                          />
                          <label
                            htmlFor={`user-${u.uid}`}
                            className="text-sm cursor-pointer"
                          >
                            {formatUserDisplayName(u, { showEmail: false })}
                            {(u.locations?.length ?? 0) > 0 && (
                              <Badge variant="secondary" className="ml-2">
                                {(u.locations?.length ?? 0)} loc
                              </Badge>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                <div>
                  <Label className="text-sm font-medium">Locations to assign</Label>
                  <ScrollArea className="h-[200px] rounded-md border p-3 mt-1">
                    <div className="space-y-2">
                      {activeLocations.map((loc) => (
                        <div key={loc.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`loc-${loc.id}`}
                            checked={selectedLocationIds.has(loc.id)}
                            onCheckedChange={() => toggleLocation(loc.id)}
                          />
                          <label htmlFor={`loc-${loc.id}`} className="text-sm cursor-pointer">
                            {loc.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              <Button
                onClick={handleAssignLocationsToUsers}
                disabled={assigning || selectedUserIds.size === 0 || selectedLocationIds.size === 0}
              >
                {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Assign locations to selected users
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmRemoveId} onOpenChange={(open) => !open && setConfirmRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove location?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the location. Users who had this location will no longer have it. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => confirmRemoveId && handleRemoveLocation(confirmRemoveId)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
