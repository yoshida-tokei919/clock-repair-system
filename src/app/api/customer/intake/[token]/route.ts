import { NextResponse } from "next/server";

import {
  getRepairIntakeInviteState,
  repairIntakeErrorResponse,
  submitRepairIntake,
} from "@/lib/repair-intake";
import { getRepairIntakeShippingAddress } from "@/lib/repair-intake-shipping";

type Context = { params: { token: string } };

export async function GET(_: Request, { params }: Context) {
  try {
    const state = await getRepairIntakeInviteState(params.token);
    return NextResponse.json(state.completed ? { ...state, shippingAddress: getRepairIntakeShippingAddress() } : state);
  } catch (error) {
    const response = repairIntakeErrorResponse(error);
    if (response) return NextResponse.json(response.body, { status: response.status });
    console.error("Repair intake validation failed", error);
    return NextResponse.json({ error: "Unable to validate intake link." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const payload = await request.json();
    const result = await submitRepairIntake(params.token, payload);
    return NextResponse.json({ ...result, count: result.repairs.length, shippingAddress: getRepairIntakeShippingAddress() }, { status: 201 });
  } catch (error) {
    const response = repairIntakeErrorResponse(error);
    if (response) return NextResponse.json(response.body, { status: response.status });
    console.error("Repair intake submission failed", error);
    return NextResponse.json({ error: "Unable to submit repair intake." }, { status: 500 });
  }
}
