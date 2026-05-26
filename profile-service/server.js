import Fastify from 'fastify';
import "dotenv/config"
import cors from "@fastify/cors"
import { initDatabase } from './database/database.js';
import router from './routes/routes.js';

const fastify = Fastify(
    {logger: true}
);

await initDatabase();

fastify.register(cors, {origin: true});
fastify.register(router);

const port = process.env.PROFILE_PORT;
fastify.listen({port:port}, 
    () => console.log(`Listening on port ${port}`));