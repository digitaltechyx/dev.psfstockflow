import { buildGoogleDrivePath, getFolderInfo as getDriveFolderInfo } from "./google-drive";

/**
 * Get month name from date
 */
function getMonthName(date: Date): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[date.getMonth()];
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Build the storage path based on the folder structure:
 * [Year]/[Month]/[Client Name]/[Date]/[FileName]
 */
function buildStoragePath(
  fileName: string,
  clientName: string,
  date: Date
): string {
  return buildGoogleDrivePath(fileName, clientName, date);
}

export interface UploadProgress {
  progress: number; // 0-100
  state: "running" | "paused" | "success" | "error";
}

export interface UploadResult {
  success: boolean;
  storagePath?: string;
  downloadURL?: string;
  error?: string;
}

/**
 * Upload PDF to Google Drive with the specified folder structure
 * 
 * @param file - The PDF file to upload
 * @param clientName - Name of the client/user uploading the file
 * @param onProgress - Optional callback for upload progress
 * @returns Promise with upload result
 */
export async function uploadPDF(
  file: File,
  clientName: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Validate file type
    if (file.type !== "application/pdf") {
      return {
        success: false,
        error: "Only PDF files are allowed",
      };
    }

    // Build folder path (OneDrive: Year/Month/ClientName/Date — filename is added by API)
    const currentDate = new Date();
    const { year, month, date } = getDriveFolderInfo(currentDate);
    const folderPath = `${year}/${month}/${clientName}/${date}`;

    if (onProgress) {
      onProgress({
        progress: 10,
        state: "running",
      });
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientName', clientName);
    formData.append('folderPath', folderPath);

    const response = await fetch('/api/onedrive/upload', {
      method: 'POST',
      body: formData,
    });

    if (onProgress) {
      onProgress({
        progress: 50,
        state: "running",
      });
    }

    if (!response.ok) {
      let errorMessage = "Label upload failed.";
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.details || errorMessage;
        errorDetails = errorData.details || '';
        
        // Combine error message with hint if available
        if (errorData.hint) {
          errorMessage = `${errorMessage}\n\n${errorData.hint}`;
        }
        
        // Include details if available and different from error message
        if (errorDetails && !errorMessage.includes(errorDetails)) {
          errorDetails = `\n\nDetails: ${errorDetails}`;
        } else {
          errorDetails = '';
        }
        
        console.error('Upload error details:', errorData);
      } catch (e) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
        console.error('Upload error:', errorText);
      }
      
      if (onProgress) {
        onProgress({
          progress: 0,
          state: "error",
        });
      }
      
      return {
        success: false,
        error: errorMessage + errorDetails,
      };
    }

    const result = await response.json();

    if (onProgress) {
      onProgress({
        progress: 100,
        state: "success",
      });
    }

    return {
      success: true,
      storagePath: result.storagePath,
      downloadURL: result.downloadURL || result.webUrl,
    };
  } catch (error: any) {
    if (onProgress) {
      onProgress({
        progress: 0,
        state: "error",
      });
    }
    return {
      success: false,
      error: error.message || "Label upload failed.",
    };
  }
}

/**
 * Helper function to get year, month, and date from a Date object
 */
export function getFolderInfo(date: Date) {
  return {
    year: date.getFullYear().toString(),
    month: getMonthName(date),
    date: formatDate(date),
  };
}

