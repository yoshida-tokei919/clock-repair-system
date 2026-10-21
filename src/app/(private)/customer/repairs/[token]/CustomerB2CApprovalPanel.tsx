"use client";

import { useEffect, useState } from "react";
import { CustomerRepairActions } from "./CustomerRepairActions";
import { CustomerReturnAddress, type ReturnAddress } from "./CustomerReturnAddress";

type Props = { token: string; address: ReturnAddress; isApproved: boolean; showApproval: boolean; inquiryNumber: string; photoPostingOptOut: boolean; lineUrl: string };

export function CustomerB2CApprovalPanel(props: Props) {
  const [currentAddress, setCurrentAddress] = useState(props.address);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => { setCurrentAddress(props.address); }, [props.address]);

  const openEditor = () => {
    setApprovalDialogOpen(false);
    setEditDialogOpen(true);
  };

  const closeEditor = (open: boolean) => {
    setEditDialogOpen(open);
    if (!open) setApprovalDialogOpen(true);
  };

  const handleAddressSaved = (nextAddress: ReturnAddress) => {
    setCurrentAddress(nextAddress);
    setEditDialogOpen(false);
    setApprovalDialogOpen(true);
  };

  return <><CustomerReturnAddress token={props.token} address={currentAddress} open={editDialogOpen} disabled={props.isApproved || !props.showApproval} onOpenChange={closeEditor} onAddressSaved={handleAddressSaved} /><CustomerRepairActions token={props.token} isBusiness={false} isApproved={props.isApproved} showApproval={props.showApproval} lineUrl={props.lineUrl} inquiryNumber={props.inquiryNumber} photoPostingOptOut={props.photoPostingOptOut} approvalAddress={currentAddress} approvalDialogOpen={approvalDialogOpen} onApprovalDialogOpenChange={setApprovalDialogOpen} onEditReturnAddress={openEditor} /></>;
}
