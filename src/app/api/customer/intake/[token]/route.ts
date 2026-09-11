import { NextResponse } from "next/server";

import {
  getRepairIntakeInviteState,
  repairIntakeErrorResponse,
  submitRepairIntake,
} from "@/lib/repair-intake";

type Context = { params: { token: string } };

export async function GET(_: Request, { params }: Context) {
  try {
    return NextResponse.json(await getRepairIntakeInviteState(params.token));
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
    return NextResponse.json(await submitRepairIntake(params.token, payload), { status: 201 });
  } catch (error) {
    const response = repairIntakeErrorResponse(error);
    if (response) return NextResponse.json(response.body, { status: response.status });
    console.error("Repair intake submission failed", error);
    return NextResponse.json({ error: "Unable to submit repair intake." }, { status: 500 });
  }
}
