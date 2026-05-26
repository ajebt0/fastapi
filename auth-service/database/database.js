import pg from 'pg';
import 'dotenv/config'
const {Pool} = pg;

let pool;

export async function initDatabase() {
    pool = new Pool({connectionString: process.env.DATABASE_URL, ssl: {rejectUnauthorized: false}});
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users
        (
            id SERIAL PRIMARY KEY,
            login TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `)
    return pool;
}

export async function getDatabase(){
    return pool;
}