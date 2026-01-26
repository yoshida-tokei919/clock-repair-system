const { PrismaClient } = require('@prisma/client');
const pg = new PrismaClient();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'prisma', 'dev.db');
const db = new sqlite3.Database(dbPath);

async function check() {
    const pgCount = await pg.repair.count();
    db.get('SELECT count(*) as count FROM Repair', [], (err, row) => {
        console.log('SQLite Repairs:', row.count);
        console.log('Supabase Repairs:', pgCount);
        db.close();
        pg.$disconnect();
    });
}

check();
