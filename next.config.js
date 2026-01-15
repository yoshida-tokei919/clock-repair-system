/** @type {import('next').NextConfig} */
const nextConfig = {
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
