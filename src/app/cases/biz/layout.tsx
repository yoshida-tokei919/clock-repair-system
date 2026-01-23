import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default function B2BLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Session Check
    const session = cookies().get("b2b_session");
    const isAuthenticated = session?.value === "authenticated";

    if (!isAuthenticated) {
        redirect("/cases/biz/login"); // Redirect to login if not authenticated
    }

    return (
        <>
            {/* Secured Content */}
            {children}
        </>
    );
}
