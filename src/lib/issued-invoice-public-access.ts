export function publicInvoicePdfAllowed(status: string) {
  return status === "issued" || status === "paid";
}

export function consolidatedShareRevoked(supersession: { id: number } | null) {
  return supersession !== null;
}
