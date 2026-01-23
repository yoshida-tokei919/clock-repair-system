"use server";

import { cookies } from "next/headers";

export async function setB2BSession(password: string) {
    if (password === "2024") {
        cookies().set("b2b_session", "authenticated", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: "/",
        });
        return { success: true };
    }
    return { success: false };
}

export async function checkB2BSession() {
    const session = cookies().get("b2b_session");
    return session?.value === "authenticated";
}
