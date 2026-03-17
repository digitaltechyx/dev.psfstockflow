"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FileText, Download, Upload, Loader2, CheckCircle, Clock, FileSignature, Eye } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { generateMSAPDF } from "@/lib/msa-pdf-generator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface DocumentRequest {
  id: string;
  userId: string;
  documentType: string;
  status: "pending" | "complete" | "rejected";
  requestedAt: any;
  completedAt?: any;
  documentUrl?: string;
  fileName?: string;
  notes?: string;
  companyName?: string;
  contact?: string;
  email?: string;
  /** Client legal name typed as signature on the agreement. */
  clientLegalName?: string;
  /** How the request was fulfilled: approved using template vs uploaded file. */
  decisionType?: "approved" | "uploaded";
}

export default function DocumentsPage() {
  const { userProfile, user } = useAuth();
  const { toast } = useToast();
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestStep, setRequestStep] = useState<1 | 2>(1);
  const [notes, setNotes] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [clientLegalName, setClientLegalName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msaDownloading, setMsaDownloading] = useState(false);

  const { data: documentRequests, loading } = useCollection<DocumentRequest>(
    userProfile ? `users/${userProfile.uid}/documentRequests` : ""
  );

  const validateStepOne = () => {
    if (!userProfile || !user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please log in to request documents.",
      });
      return;
    }

    if (!companyName || companyName.trim().length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Company Name is required.",
      });
      return;
    }

    if (!contact || contact.trim().length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Contact is required.",
      });
      return;
    }

    if (!email || email.trim().length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Email is required.",
      });
      return;
    }

    if (!clientLegalName || clientLegalName.trim().length === 0) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Client legal name (signature) is required.",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please enter a valid email address.",
      });
      return;
    }

    return true;
  };

  const handleNextFromDetails = () => {
    const ok = validateStepOne();
    if (ok) {
      setRequestStep(2);
    }
  };

  const handleRequestDocument = async () => {
    if (!userProfile || !user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please log in to request documents.",
      });
      return;
    }

    // Revalidate in case user bypassed step
    if (!validateStepOne()) return;

    setIsSubmitting(true);
    try {
      // Build the request data object
      const requestData: any = {
        userId: userProfile.uid,
        documentType: "Fulfillment & Prep Services Agreement",
        status: "pending",
        requestedAt: Timestamp.now(),
        companyName: companyName.trim(),
        contact: contact.trim(),
        email: email.trim(),
        clientLegalName: clientLegalName.trim(),
        // Service provider signature is always Prep Services FBA in this flow
        serviceProviderName: "Prep Services FBA LLC",
      };

      // Only include notes if it has a non-empty value
      if (notes && notes.trim().length > 0) {
        requestData.notes = notes.trim();
      }

      await addDoc(collection(db, `users/${userProfile.uid}/documentRequests`), requestData);

      toast({
        title: "Request Submitted",
        description: "Your agreement request has been submitted. Admin will review and approve or upload it.",
      });

      setNotes("");
      setCompanyName("");
      setContact("");
      setEmail("");
      setClientLegalName("");
      setRequestStep(1);
      setRequestDialogOpen(false);
    } catch (error: any) {
      console.error("Error submitting document request:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit request. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "document.pdf";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadMSA = async () => {
    if (!userProfile?.msaClientDetails || !userProfile?.msaEffectiveDate) return;
    setMsaDownloading(true);
    try {
      const acceptedAt = userProfile.accountActivatedAt && "seconds" in userProfile.accountActivatedAt
        ? format(new Date(userProfile.accountActivatedAt.seconds * 1000), "MMMM d, yyyy")
        : undefined;
      const blob = await generateMSAPDF({
        effectiveDate: userProfile.msaEffectiveDate,
        clientDetails: userProfile.msaClientDetails,
        acceptedAt,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MSA-${userProfile.msaClientDetails.companyName.replace(/\s+/g, "-")}-${userProfile.msaEffectiveDate}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "Download started", description: "Your MSA has been downloaded." });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to generate MSA PDF.",
      });
    } finally {
      setMsaDownloading(false);
    }
  };

  const pendingRequests = documentRequests.filter((req) => req.status === "pending");
  const completedRequests = documentRequests.filter((req) => req.status === "complete");

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-1">
            Request and download your service documents
          </p>
        </div>
        <Dialog
          open={requestDialogOpen}
          onOpenChange={(open) => {
            setRequestDialogOpen(open);
            if (!open) {
              setRequestStep(1);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <FileText className="mr-2 h-4 w-4" />
              Request Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fulfillment & Prep Services Agreement</DialogTitle>
              <DialogDescription>
                Fill your company details and sign digitally. On the next step you can optionally add notes for the admin.
              </DialogDescription>
            </DialogHeader>
            {requestStep === 1 ? (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-md border p-3 text-sm">
                  <div className="space-y-1">
                    <p className="font-semibold">Service Provider</p>
                    <p className="text-muted-foreground">Prep Services FBA LLC</p>
                    <p className="text-muted-foreground text-xs">Email: info@prepservicesfba.com</p>
                    <p className="text-muted-foreground text-xs">Phone: +1 347 651 3010</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">Client</p>
                    <p className="text-muted-foreground text-xs">
                      Please fill your company details below. These will appear on the agreement.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">
                    Company Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="companyName"
                    placeholder="Enter company name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact">
                    Contact <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contact"
                    placeholder="Enter contact number"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientLegalName">
                    Client Legal Name (signature) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="clientLegalName"
                    placeholder="Type your full legal name"
                    value={clientLegalName}
                    onChange={(e) => setClientLegalName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    This will appear on the agreement as the client signature. Service provider will be shown as{" "}
                    <span className="font-medium">Prep Services FBA LLC</span>.
                  </p>
                </div>
                <Button
                  onClick={handleNextFromDetails}
                  className="w-full"
                >
                  Next
                </Button>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <div className="space-y-1">
                  <p className="font-medium">Review & Notes (optional)</p>
                  <p className="text-sm text-muted-foreground">
                    Add any notes if you want the admin to modify or add clauses to the agreement (optional).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Example: Please adjust pricing paragraph, or add my warehouse address..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-32"
                    onClick={() => setRequestStep(1)}
                    disabled={isSubmitting}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleRequestDocument}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Master Service Agreement (signed) */}
      {userProfile?.msaClientDetails && userProfile?.msaEffectiveDate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-indigo-500" />
              Master Service Agreement
            </CardTitle>
            <CardDescription>
              Your accepted agreement (effective {userProfile.msaEffectiveDate}). You can download a copy below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
              <div>
                <p className="font-medium">{userProfile.msaClientDetails.companyName}</p>
                <p className="text-sm text-muted-foreground">
                  Accepted by {userProfile.msaClientDetails.legalName} · Effective {userProfile.msaEffectiveDate}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadMSA} disabled={msaDownloading}>
                {msaDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Pending Requests
            </CardTitle>
            <CardDescription>
              Your document requests awaiting admin review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{request.documentType}</p>
                      <p className="text-sm text-muted-foreground">
                        Requested {format(new Date(request.requestedAt?.seconds * 1000 || Date.now()), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      {request.notes && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Notes: {request.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    Pending
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Available Documents
          </CardTitle>
          <CardDescription>
            Documents that have been uploaded and are ready to download
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : completedRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents available yet.</p>
              <p className="text-sm mt-1">
                Request a document above and admin will upload it for you.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{request.documentType}</p>
                      <p className="text-sm text-muted-foreground">
                        Completed {request.completedAt && format(new Date(request.completedAt?.seconds * 1000), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      {request.fileName && (
                        <p className="text-sm text-muted-foreground mt-1">
                          File: {request.fileName}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Complete
                    </Badge>
                    {request.documentUrl && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(request.documentUrl!, "_blank")}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(request.documentUrl!, request.fileName || "document.pdf")}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

