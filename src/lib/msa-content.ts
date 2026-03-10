/**
 * MSA (Master Service Agreement) – company details and agreement text.
 * Used on activate-account page and for PDF generation.
 */

export const MSA_SERVICE_PROVIDER = {
  name: "Prep Services FBA LLC",
  address: "7000 Atrium Way B05,\nMount Laurel, NJ 08054",
  email: "info@prepservicesfba.com",
  phone: "+1 347 661 3010",
};

export const MSA_AGREEMENT_SECTIONS = [
  {
    title: "1. PURPOSE & Services",
    body: "This Agreement governs all warehousing, preparation, storage, fulfillment, labeling, bundling, kitting, returns processing, and shipment handling services provided by Prep Services FBA (“Services”). Services are performed in accordance with Prep Services FBA operational and billing policies available in the client portal.",
  },
  {
    title: "2. Payment Terms",
    body: "Invoices are issued the same day services are completed or storage is billed. Payment must be completed within 48 hours. A $19 late fee applies to unpaid invoices after 48 hours. For pay-as-you-go clients, shipments will not be processed or released until full payment is received.",
  },
  {
    title: "3. Storage & Unpaid Balances",
    body: "Inventory with unpaid balances exceeding 30 days may be held, liquidated, or disposed of to recover outstanding charges. Prep Services FBA reserves the right to hold or refuse release of inventory until all outstanding invoices are paid in full.",
  },
  {
    title: "4. Client Responsibilities",
    body: "Client agrees to: Provide accurate shipment contents and quantities; Use valid and legally purchased shipping labels; Ensure all products are authentic and compliant with marketplace and carrier requirements. Client is solely responsible for maintaining product and transit insurance coverage. Client may not use Prep Services FBA's address for business registration, returns, or correspondence without written approval.",
  },
  {
    title: "5. Zero-Tolerance Compliance",
    body: "Fraudulent activity, fake labels, or counterfeit goods will result in: Immediate account suspension; Confiscation of affected inventory; Penalty of up to $5,000 per occurrence, plus any damages and operational costs.",
  },
  {
    title: "6. BILLING Disputes",
    body: "Client must contact Prep Services FBA to resolve billing questions prior to initiating any chargeback or payment dispute. Failure to do so may result in account suspension or termination.",
  },
  {
    title: "7. Liability Limitations",
    body: "Prep Services FBA exercises reasonable care in handling goods, but is not responsible for: Carrier delays or damage; Amazon or marketplace losses; Manufacturer defects; Force majeure events beyond reasonable control. Prep Services FBA shall not be liable for loss or damage unless caused by its gross negligence or willful misconduct. Liability is strictly limited to the service fees paid for the specific affected services.",
  },
  {
    title: "8. Turnaround Times",
    body: "All turnaround times are estimates and may vary based on shipment condition, compliance, and operational volume. Expedited or same-day processing is not guaranteed unless agreed in writing.",
  },
  {
    title: "9. Term & Termination",
    body: "This Agreement operates on a month-to-month basis and may be terminated by either party with 14 days' written notice. Prep Services FBA may suspend or terminate services immediately for: Non-payment; Fraud or policy violations.",
  },
  {
    title: "10. Governing Law",
    body: "This Agreement shall be governed by the laws of the State of New Jersey.",
  },
  {
    title: "11. ACCEPTANCE",
    body: "This Agreement may be executed electronically and shall be deemed legally binding upon digital acceptance.",
  },
];
