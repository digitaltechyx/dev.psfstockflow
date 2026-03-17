import jsPDF from "jspdf";

const SERVICE_PROVIDER = {
  name: "Prep Services FBA LLC",
  contact: "info@prepservicesfba.com",
  phone: "+1 347 661 3010",
};

export interface FulfillmentAgreementData {
  companyName: string;
  contact: string;
  email: string;
  clientLegalName: string;
  /** Optional: completion date for signature block */
  completedAt?: string;
}

/**
 * Generates the Fulfillment & Prep Services Agreement PDF with client details and signatures.
 */
export async function generateFulfillmentAgreementPDF(data: FulfillmentAgreementData): Promise<Blob> {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const addText = (text: string, fontSize: number = 10, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((line: string) => {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += fontSize * 0.45;
    });
    y += 2;
  };

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Fulfillment & Prep Services Agreement", margin, y);
  y += 10;

  addText(
    "This agreement is made between Prep Services FBA LLC (Service Provider) and the Client for warehousing, prep, and fulfillment services.",
    10
  );
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.text("Service Provider", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  addText(SERVICE_PROVIDER.name, 10);
  addText(`Contact: ${SERVICE_PROVIDER.contact}`, 10);
  addText(`Phone: ${SERVICE_PROVIDER.phone}`, 10);
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.text("Client", margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  addText(data.companyName || "(Company)", 10);
  addText(`Contact: ${data.contact || "—"}`, 10);
  addText(`Email: ${data.email || "—"}`, 10);
  y += 8;

  addText("Scope of Services", 10, true);
  addText(
    "Services include warehousing, inventory receiving, Amazon FBA prep, labeling, kitting, pick & pack, and order fulfillment.",
    9
  );

  addText("Pricing", 10, true);
  addText(
    "Services are billed monthly according to the rate card, covering storage, pick/pack, prep, and shipping costs.",
    9
  );

  addText("Payment", 10, true);
  addText(
    "Invoices must be paid before shipment processing unless otherwise agreed in writing.",
    9
  );

  addText("Documentation", 10, true);
  addText(
    "The Service Provider will provide invoices, receiving reports, and onboarding confirmation for verification as needed.",
    9
  );

  addText("Term & Termination", 10, true);
  addText(
    "This agreement is month-to-month. Either party may terminate with 14 days' written notice.",
    9
  );

  addText("Liability", 10, true);
  addText(
    "Prep Services FBA LLC exercises reasonable care but is not responsible for manufacturer defects, supplier errors, carrier damage, or Amazon discrepancies after shipments leave its facility.",
    9
  );

  addText("Governing Law", 10, true);
  addText("This agreement is governed by the laws of the State of New Jersey.", 9);
  y += 4;

  addText("Agreed and Accepted by:", 10, true);
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.text("Authorized Signature (Service Provider)", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(SERVICE_PROVIDER.name, margin, y);
  y += 6;
  doc.text("Date: " + (data.completedAt || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })), margin, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Authorized Signature (Client)", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(data.clientLegalName || "—", margin, y);
  y += 6;
  doc.text("Date: " + (data.completedAt || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })), margin, y);

  return doc.output("blob");
}
