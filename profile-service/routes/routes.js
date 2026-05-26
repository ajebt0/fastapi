export { getDatabase } from '../database/database.js';
export default async function router(fastify) {
    fastify.get("/api/profile", async (req, reply) => {
         const { user_id }  = req.user_id;
         const db = await getDatabase();
         const result = db.query(`SELECT * FROM profiles WHERE user_id=${user_id}`);
         
         return reply(result.rows[0]);
    });

    fastify.post("/api/profile", async(req, reply) => {
        const { user_id, full_name, bio, email } = req.body;
        const db = await getDatabase();
        db.query(`
            INSERT INTO profiles (user_id, full_name, email, bio) VALUES ($1 $2 $3 $4)`,
                [user_id, full_name, email, bio]);
    });
}