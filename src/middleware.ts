
export { default } from "next-auth/middleware";

export const config = {
    matcher: [
        "/repairs/:path*",
        "/storage-locations/:path*",
        "/shipments/:path*",
        "/board/:path*",
        "/customers/:path*",
        "/line-users/:path*",
        "/documents/:path*",
        "/admin/:path*",
        "/inquiries/:path*",
        "/reports/:path*",
        "/parts/:path*",
        "/settings/:path*",
    ],
};
