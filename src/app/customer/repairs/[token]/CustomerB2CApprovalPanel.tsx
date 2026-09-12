"use client";

import { useCallback, useState } from "react";
import { CustomerRepairActions } from "./CustomerRepairActions";
import { CustomerReturnAddress, type ReturnAddress } from "./CustomerReturnAddress";

type Props = { token: string; address: ReturnAddress; isApproved: boolean; showApproval: boolean; inquiryNumber: string; photoPostingOptOut: boolean; lineUrl: string };

export function CustomerB2CApprovalPanel(props: Props) {
  const [approvalState, setApprovalState] = useState({ disabled: !props.isApproved, message: "返送先を確認しています。" });
  const [editRequestId, setEditRequestId] = useState(0);
  const handleApprovalStateChange = useCallback((next: { disabled: boolean; message: string }) => setApprovalState(next), []);
  return <><CustomerReturnAddress token={props.token} address={props.address} disabled={props.isApproved || !props.showApproval} editRequestId={editRequestId} onApprovalStateChange={handleApprovalStateChange} /><CustomerRepairActions token={props.token} isBusiness={false} isApproved={props.isApproved} showApproval={props.showApproval} lineUrl={props.lineUrl} inquiryNumber={props.inquiryNumber} photoPostingOptOut={props.photoPostingOptOut} approvalAddress={props.address} onEditReturnAddress={() => setEditRequestId((value) => value + 1)} approvalDisabled={approvalState.disabled} approvalDisabledMessage={approvalState.message} /></>;
}
