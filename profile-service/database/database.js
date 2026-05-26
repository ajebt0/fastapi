import pg from "pg";
const {Pool} = pg;

let pool;

export async function initDatabase() {
    pool = new Pool({connectionString: process.env.DATABASE_URL,
            ssl: {rejectUnauthorized: false}},
        `CREATE TABLE IF NOT EXISTS profile(
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            full_name TEXT,
            email TEXT,
            bio TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        )`
    );
    return pool;
}

export async function getDatabase(){
    return pool;
}