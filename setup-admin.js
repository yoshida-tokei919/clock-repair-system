
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
    const email = 'admin@yoshida-watch.com';
    const password = 'yoshida-repair-admin'; // 初期パスワード
    const hashedPassword = await bcrypt.hash(password, 10);

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

    console.log('-----------------------------------');
    console.log('管理者ユーザーを設定しました。');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('-----------------------------------');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
