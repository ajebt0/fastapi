import express from 'express';
import 'dotenv/config'
import {initDatabase} from "./database/database.js";
import apiRoutes from "./routes/api.js";
import pageRoutes from "./routes/pages.js";
import {fileURLToPath} from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.AUTH_PORT || 3000;

await initDatabase();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/", pageRoutes);
app.use("/api", apiRoutes);

app.listen(port, () => {
    console.log(`Server started http://localhost:${port}`);
});