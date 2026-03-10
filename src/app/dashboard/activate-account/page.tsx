"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { getDefaultFeaturesForRole } from "@/lib/permissions";
import { MSA_SERVICE_PROVIDER, MSA_AGREEMENT_SECTIONS } from "@/lib/msa-content";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileSignature, Building2, User } from "lucide-react";
import { format } from "date-fns";
import { hasRole, isAccountActivated } from "@/lib/permissions";

const effectiveDate = format(new Date(), "MMMM d, yyyy");

export default function ActivateAccountPage() {
  const { userProfile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [legalName, setLegalName] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (loading || !userProfile) return;
    if (!hasRole(userProfile, "user") || isAccountActivated(userProfile)) {
      router.replace("/dashboard");
      return;
    }
    setCompanyName(userProfile.companyName ?? "");
    setAddress(
      [userProfile.address, userProfile.city, userProfile.state, userProfile.country, userProfile.zipCode]
        .filter(Boolean)
        .join(", ")
    );
    setEmail(userProfile.email ?? "");
    setPhone(userProfile.phone ?? "");
    setLegalName(userProfile.name ?? "");
  }, [userProfile, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile?.uid) return;

    const trim = (s: string) => (s ?? "").trim();
    if (!trim(companyName) || !trim(address) || !trim(email) || !trim(phone) || !trim(legalName)) {
      toast({
        variant: "destructive",
        title: "All fields required",
        description: "Please fill in all client details and your legal name.",
      });
      return;
    }
    if (!agreed) {
      toast({
        variant: "destructive",
        title: "Acceptance required",
        description: "Please check the box to agree to be legally bound by the agreement.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const msaEffectiveDate = format(new Date(), "yyyy-MM-dd");
      const hasExistingFeatures = Array.isArray(userProfile.features) && userProfile.features.length > 0;
      const updateData: Record<string, unknown> = {
        accountActivatedAt: serverTimestamp(),
        msaClientDetails: {
          legalName: trim(legalName),
          companyName: trim(companyName),
          address: trim(address),
          email: trim(email),
          phone: trim(phone),
        },
        msaEffectiveDate,
      };
      // New users have no features; give them default. Existing users keep their current features.
      if (!hasExistingFeatures) {
        updateData.features = getDefaultFeaturesForRole("user");
      }
      await updateDoc(doc(db, "users", userProfile.uid), updateData);
      toast({
        title: "Account activated",
        description: "You can now access your dashboard and documents.",
      });
      router.replace("/dashboard");
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to activate account.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !userProfile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasRole(userProfile, "user") || isAccountActivated(userProfile)) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Activate your account</h1>
        <p className="text-muted-foreground mt-1">
          Accept the Master Service Agreement to unlock your dashboard and features.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Agreement intro */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Master Service Agreement
            </CardTitle>
            <CardDescription>
              This Master Service Agreement (“Agreement”) is entered into as of {effectiveDate}, by and between:
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-8 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Service Provider</Label>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">{MSA_SERVICE_PROVIDER.name}</p>
                <p className="whitespace-pre-line text-muted-foreground">{MSA_SERVICE_PROVIDER.address}</p>
                <p className="text-muted-foreground">
                  {MSA_SERVICE_PROVIDER.email} | {MSA_SERVICE_PROVIDER.phone}
                </p>
                <p className="text-xs text-muted-foreground mt-1">(Service Provider)</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Client</Label>
              <div className="space-y-3 rounded-lg border bg-background p-4">
                <div>
                  <Label htmlFor="companyName" className="text-xs">Legal Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="[Client Legal Company Name]"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="address" className="text-xs">Address</Label>
                  <Textarea
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="[Client Legal Company Address]"
                    className="mt-1 min-h-[60px]"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-xs">Email / Phone</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      required
                    />
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone"
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">(Client)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agreement sections */}
        <Card>
          <CardContent className="pt-6">
            <div className="prose prose-sm max-w-none space-y-6">
              {MSA_AGREEMENT_SECTIONS.map((section) => (
                <div key={section.title}>
                  <h3 className="font-semibold text-foreground">{section.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{section.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Acceptance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Acceptance</CardTitle>
            <CardDescription>
              By activating, you agree to be legally bound by this Agreement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="agree"
                checked={agreed}
                onCheckedChange={(c) => setAgreed(!!c)}
              />
              <label htmlFor="agree" className="text-sm leading-relaxed cursor-pointer">
                I am authorized and agree to be legally bound by this agreement.
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="legalName">Legal name (required)</Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full legal name"
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activating...
                </>
              ) : (
                "Activate account"
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
