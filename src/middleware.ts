
export { default } from "next-auth/middleware";

export const config = {
    matcher: [
        "/repairs/:path*",
        "/board/:path*",
        "/customers/:path*",
        "/documents/:path*",
        "/admin/:path*",
        "/reports/:path*",
        "/parts/:path*",
    ],
};
