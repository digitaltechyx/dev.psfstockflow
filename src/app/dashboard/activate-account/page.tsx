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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileSignature, Building2, User, CheckCircle2, Mail, Phone, MapPin } from "lucide-react";
import { format } from "date-fns";
import { hasRole, isAccountActivated } from "@/lib/permissions";
import { cn } from "@/lib/utils";

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
    <div className="min-h-full bg-gradient-to-b from-muted/20 to-background">
      <div className="mx-auto max-w-3xl space-y-8 py-10 px-4 sm:px-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-2">
            <FileSignature className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Activate your account</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Accept the Master Service Agreement to unlock your dashboard and features.
          </p>
          <p className="text-sm text-muted-foreground/80">Effective date: {effectiveDate}</p>
        </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Agreement intro */}
        <Card className="overflow-hidden border-2 shadow-sm rounded-2xl">
          <CardHeader className="bg-muted/30 border-b pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSignature className="h-5 w-5 text-primary" />
              Master Service Agreement
            </CardTitle>
            <CardDescription className="text-base">
              This Agreement is entered into as of <span className="font-medium text-foreground">{effectiveDate}</span>, by and between:
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <Label className="text-sm font-semibold text-muted-foreground">Service Provider</Label>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2 text-sm">
                <p className="font-semibold text-foreground">{MSA_SERVICE_PROVIDER.name}</p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{MSA_SERVICE_PROVIDER.address}</span>
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" />
                  {MSA_SERVICE_PROVIDER.email}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" />
                  {MSA_SERVICE_PROVIDER.phone}
                </p>
                <p className="text-xs text-muted-foreground/80 pt-1">(Service Provider)</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </div>
                <Label className="text-sm font-semibold text-muted-foreground">Client (your details)</Label>
              </div>
              <div className="space-y-3 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-background p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName" className="text-xs font-medium">Legal Company Name</Label>
                  <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your company name" className="h-9" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-xs font-medium">Address</Label>
                  <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" className="min-h-[72px] resize-none text-sm" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="h-9" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium">Phone</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="h-9" required />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/80">(Client)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border-2 shadow-sm">
          <CardHeader className="bg-muted/20 border-b py-4">
            <CardTitle className="text-base">Agreement terms</CardTitle>
            <CardDescription>Please read the full agreement below.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[320px] w-full px-6 py-4">
              <div className="space-y-5 pr-4">
                {MSA_AGREEMENT_SECTIONS.map((section, i) => (
                  <div key={section.title} className={cn(i > 0 && "pt-4 border-t border-border/60")}>
                    <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide mb-1.5">
                      {section.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{section.body}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-2xl border-2 border-primary/20 bg-primary/5 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Acceptance
            </CardTitle>
            <CardDescription>
              By activating, you agree to be legally bound by this Agreement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-background/80 border">
              <Checkbox
                id="agree"
                checked={agreed}
                onCheckedChange={(c) => setAgreed(!!c)}
                className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <label htmlFor="agree" className="text-sm font-medium leading-relaxed cursor-pointer select-none">
                I am authorized and agree to be legally bound by this agreement.
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="legalName" className="text-sm font-medium">
                Legal name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full legal name as on agreement"
                className="h-11 max-w-md"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              size="lg"
              className="w-full sm:w-auto min-w-[200px] h-12 text-base font-semibold shadow-lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Activate account
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
      </div>
    </div>
  );
}
