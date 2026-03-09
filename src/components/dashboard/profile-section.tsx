"use client";

import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { doc, updateDoc } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { reauthenticateWithCredential, updatePassword, EmailAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { User, Lock, Phone, Building2, Hash, MapPin, Mail, AlertCircle, Upload, Image as ImageIcon, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhoneInput } from "@/components/ui/phone-input";
import imageCompression from "browser-image-compression";

export function ProfileSection() {
  const { userProfile, user } = useAuth();
  const { toast } = useToast();
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [phone, setPhone] = useState(userProfile?.phone || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdatePhone = async () => {
    if (!phone.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid Phone",
        description: "Phone number cannot be empty.",
      });
      return;
    }

    if (!userProfile) return;

    try {
      setIsLoading(true);
      await updateDoc(doc(db, "users", userProfile.uid), {
        phone: phone.trim(),
      });

      toast({
        title: "Success",
        description: "Phone number updated successfully!",
      });

      setIsEditingPhone(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Failed to update phone number.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const validatePassword = (): boolean => {
    const errors: string[] = [];

    if (!currentPassword) {
      errors.push("Current password is required");
    }

    if (!newPassword) {
      errors.push("New password is required");
    } else {
      if (newPassword.length < 6) {
        errors.push("New password must be at least 6 characters");
      }
    }

    if (!confirmPassword) {
      errors.push("Please confirm your new password");
    } else if (newPassword !== confirmPassword) {
      errors.push("Passwords do not match");
    }

    if (newPassword && currentPassword && newPassword === currentPassword) {
      errors.push("New password must be different from current password");
    }

    setPasswordErrors(errors);
    return errors.length === 0;
  };

  const handleChangePassword = async () => {
    if (!validatePassword()) {
      return;
    }

    if (!user || !user.email) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User not authenticated properly.",
      });
      return;
    }

    try {
      setIsLoading(true);

      // Re-authenticate the user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      // Sync the updated password to user's Firestore document for admin visibility
      await updateDoc(doc(db, "users", user.uid), {
        password: newPassword,
      });

      // Clear fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsChangingPassword(false);
      setPasswordErrors([]);

      toast({
        title: "Success",
        description: "Password updated successfully!",
      });
    } catch (error: any) {
      let errorMessage = "Failed to update password.";
      
      if (error.code === "auth/wrong-password") {
        errorMessage = "Current password is incorrect.";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "New password is too weak.";
      } else if (error.code === "auth/requires-recent-login") {
        errorMessage = "Please log out and log back in before changing your password.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        variant: "destructive",
        title: "Password Change Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1, // Maximum file size in MB
      maxWidthOrHeight: 1920, // Maximum width or height
      useWebWorker: true,
      fileType: file.type,
    };

    try {
      const compressedFile = await imageCompression(file, options);
      return compressedFile;
    } catch (error) {
      console.error("Error compressing image:", error);
      throw error;
    }
  };

  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userProfile) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User profile not found.",
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Invalid File",
        description: "Please select an image file.",
      });
      return;
    }

    // Check initial file size (before compression)
    const maxSizeBytes = 10 * 1024 * 1024; // 10 MB initial limit
    if (file.size > maxSizeBytes) {
      toast({
        variant: "destructive",
        title: "File Too Large",
        description: "Please select an image smaller than 10 MB. It will be compressed automatically.",
      });
      return;
    }

    try {
      setIsUploadingPicture(true);

      // Compress the image
      const compressedFile = await compressImage(file);

      // Check if compressed file is still over 1 MB
      if (compressedFile.size > 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "Compression Failed",
          description: "Unable to compress image below 1 MB. Please try a different image.",
        });
        return;
      }

      // Upload to Firebase Storage
      const storagePath = `profile-pictures/${userProfile.uid}/${Date.now()}_${compressedFile.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, compressedFile);

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);

      // Delete old profile picture if it exists
      if (userProfile.profilePictureUrl) {
        try {
          // Extract storage path from the old URL or use it directly if it's a path
          let oldPath = userProfile.profilePictureUrl;
          // If it's a full URL, try to extract the path
          if (oldPath.startsWith('http')) {
            // Extract path from Firebase Storage URL
            const urlParts = oldPath.split('/o/');
            if (urlParts.length > 1) {
              const pathPart = urlParts[1].split('?')[0];
              oldPath = decodeURIComponent(pathPart);
            }
          }
          const oldImageRef = ref(storage, oldPath);
          await deleteObject(oldImageRef);
        } catch (error) {
          console.error("Error deleting old profile picture:", error);
          // Continue even if deletion fails
        }
      }

      // Update user profile in Firestore with download URL
      await updateDoc(doc(db, "users", userProfile.uid), {
        profilePictureUrl: downloadURL,
      });

      toast({
        title: "Success",
        description: "Profile picture uploaded successfully!",
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("Error uploading profile picture:", error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "Failed to upload profile picture. Please try again.",
      });
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!userProfile) return;

    if (!userProfile.profilePictureUrl) {
      toast({
        variant: "destructive",
        title: "No Picture",
        description: "No profile picture to remove.",
      });
      return;
    }

    try {
      setIsUploadingPicture(true);

      // Delete from Firebase Storage
      try {
        // Extract storage path from the URL or use it directly if it's a path
        let imagePath = userProfile.profilePictureUrl;
        // If it's a full URL, try to extract the path
        if (imagePath.startsWith('http')) {
          // Extract path from Firebase Storage URL
          const urlParts = imagePath.split('/o/');
          if (urlParts.length > 1) {
            const pathPart = urlParts[1].split('?')[0];
            imagePath = decodeURIComponent(pathPart);
          }
        }
        const imageRef = ref(storage, imagePath);
        await deleteObject(imageRef);
      } catch (error) {
        console.error("Error deleting profile picture from storage:", error);
        // Continue even if deletion fails
      }

      // Update user profile in Firestore
      await updateDoc(doc(db, "users", userProfile.uid), {
        profilePictureUrl: null,
      });

      toast({
        title: "Success",
        description: "Profile picture removed successfully!",
      });
    } catch (error: any) {
      console.error("Error removing profile picture:", error);
      toast({
        variant: "destructive",
        title: "Remove Failed",
        description: error.message || "Failed to remove profile picture. Please try again.",
      });
    } finally {
      setIsUploadingPicture(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5" />
          <CardTitle>Profile Settings</CardTitle>
        </div>
        <CardDescription>Manage your account information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Profile Picture Section */}
        <div className="space-y-3 border-b pb-6">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <Label>Profile Picture</Label>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              {userProfile?.profilePictureUrl ? (
                <img
                  src={userProfile.profilePictureUrl}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center border-2 border-gray-300">
                  <User className="h-12 w-12 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureUpload}
                  className="hidden"
                  id="profile-picture-upload"
                  disabled={isUploadingPicture}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPicture}
                  className="flex items-center gap-2"
                >
                  {isUploadingPicture ? (
                    <>
                      <Upload className="h-4 w-4 animate-pulse" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload Picture
                    </>
                  )}
                </Button>
                {userProfile?.profilePictureUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveProfilePicture}
                    disabled={isUploadingPicture}
                    className="flex items-center gap-2 text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Maximum file size: 1 MB. Image will be compressed automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Profile Information - Read Only */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="email">Email</Label>
            </div>
            <Input
              id="email"
              type="email"
              value={userProfile?.email || "N/A"}
              disabled
              className="bg-muted"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="name">Full Name</Label>
            </div>
            <Input
              id="name"
              type="text"
              value={userProfile?.name || "N/A"}
              disabled
              className="bg-muted"
            />
          </div>

          {userProfile?.clientId && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="clientId">Client ID</Label>
              </div>
              <Input
                id="clientId"
                type="text"
                value={userProfile.clientId}
                disabled
                className="bg-muted font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your unique 5-digit ID. Use this when contacting support or for reference.
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="companyName">Company Name</Label>
            </div>
            <Input
              id="companyName"
              type="text"
              value={userProfile?.companyName || "N/A"}
              disabled
              className="bg-muted"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="ein">EIN</Label>
            </div>
            <Input
              id="ein"
              type="text"
              value={userProfile?.ein || "N/A"}
              disabled
              className="bg-muted"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="address">Address</Label>
            </div>
            <Input
              id="address"
              type="text"
              value={userProfile?.address || "N/A"}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                type="text"
                value={userProfile?.city || "N/A"}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                type="text"
                value={userProfile?.state || "N/A"}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              type="text"
              value={userProfile?.country || "N/A"}
              disabled
              className="bg-muted"
            />
          </div>

          <div>
            <Label htmlFor="zipCode">Zip Code</Label>
            <Input
              id="zipCode"
              type="text"
              value={userProfile?.zipCode || "N/A"}
              disabled
              className="bg-muted"
            />
          </div>
        </div>

        {/* Phone Number Section */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <Label>Phone Number</Label>
          </div>

          {!isEditingPhone ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {userProfile?.phone || "No phone number set"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditingPhone(true)}
              >
                Edit
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <PhoneInput
                value={phone}
                onChange={(value) => setPhone(value || "")}
                placeholder="Enter your phone number"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleUpdatePhone}
                  disabled={isLoading}
                >
                  {isLoading ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditingPhone(false);
                    setPhone(userProfile?.phone || "");
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Password Change Section */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <Label>Password</Label>
          </div>

          {!isChangingPassword ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">••••••••</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsChangingPassword(true);
                  setPasswordErrors([]);
                }}
              >
                Change Password
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {passwordErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1">
                      {passwordErrors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleChangePassword}
                  disabled={isLoading}
                >
                  {isLoading ? "Changing..." : "Change Password"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordErrors([]);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


