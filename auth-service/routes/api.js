import express from 'express';
import {getDatabase} from '../database/database.js';
import bcrypt from "bcrypt";

const router = express.Router();

router.post('/login', async(req, res) => {
    const { login, password } = req.body??{};

    const db = await getDatabase();
    const result = await db.query('SELECT * FROM users WHERE login=$1', [login]);
    const user = result.rows[0]; // = {id, login, password, created_at}
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if(login !== user.login) {
        res.status(401).send({status: "error"});
    }
    if (!login || !password) {
        res.status(401).send({status: "error"});
    }
    if (isPasswordValid) {
        res.status(200).send({status: "success", 
            user_id: user.id, user_name: user.login});
    }
    else{
        res.status(501).send({status: "error"});
    }

});

router.post('/register', async (req, res) => {
    const { login, password } = req.body??{};

    const db = await getDatabase();
    const hashPassword = await bcrypt.hash(password, 12);
    if(password.length <= 4 || !login || !password) {
        res.status(401).send({status: "error"});
    }
    else{
        db.query('INSERT INTO users (login, password) VALUES ($1, $2)', [login, hashPassword]);
        res.status(200).send({status: "success"});
    }
    
});

export default router;