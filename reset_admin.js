const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
    const prisma = new PrismaClient();
    const email = 'admin@yoshida-watch.com';
    const password = 'yoshida-repair-admin';
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log(`Resetting password for ${email}...`);

    try {
        const admin = await prisma.admin.upsert({
            where: { email: email },
            update: {
                passwordHash: hashedPassword,
            },
            create: {
                name: '管理者',
                email: email,
                passwordHash: hashedPassword,
                role: 'admin',
            },
        });
        console.log('Successfully reset admin password to: yoshida-repair-admin');
    } catch (error) {
        console.error('Failed to reset password:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
