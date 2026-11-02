/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
        return [{
            source: '/customer/consolidated-invoices/:path*',
            headers: [
                { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
                { key: 'Referrer-Policy', value: 'no-referrer' },
                { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
                { key: 'Content-Security-Policy', value: "default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src 'self'; form-action 'none'; base-uri 'none'" },
            ],
        }];
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'pub-*.r2.dev', // Cloudflare R2 placeholder
            },
        ],
    },
};

module.exports = nextConfig;
