# Микросервисная система аутентификации и управления профилями

## 📖 Оглавление
1. [Введение в архитектуру](#введение-в-архитектуру)
2. [Технологический стек](#технологический-стек)
3. [Подготовка окружения](#подготовка-окружения)
4. [Создание Auth Service (сервер аутентификации)](#создание-auth-service)
5. [Создание Profile Service (сервер профилей)](#создание-profile-service)
6. [Фронтенд часть](#фронтенд-часть)
7. [Запуск и тестирование](#запуск-и-тестирование)
8. [Стилизация](#стилизация)

## 🏗 Введение в архитектуру

### Что мы строим?
Мы создаем два независимых микросервиса, которые общаются друг с другом:

1. **Auth Service (Порт 3000)** - отвечает за регистрацию и вход пользователей
2. **Profile Service (Порт 3001)** - хранит и управляет профилями пользователей

### Как это работает?
```
Пользователь → Auth Service (вход/регистрация) → получает JWT токен
Пользователь → Dashboard (с токеном) → Profile Service (получает/изменяет профиль)
```

### Почему такая архитектура?
- **Масштабируемость** - сервисы можно развивать независимо
- **Безопасность** - разделение ответственности
- **Гибкость** - можно заменить любой сервис без остановки всей системы

## 🛠 Технологический стек

| Компонент | Технология | Почему выбрали? |
|-----------|------------|-----------------|
| Auth Service | Express.js | Простой, гибкий, много документации |
| Profile Service | Fastify | Быстрый, встроенная валидация, легковесный |
| База данных | PostgreSQL | Надежная, поддерживает JSON, хорошая производительность |
| Аутентификация | JWT (JSON Web Token) | Стандарт, не требует хранения сессий |
| Хеширование | Bcrypt | Безопасное хеширование паролей |
| Запросы между сервисами | Fetch API | Встроенный, простой |

## 📦 Подготовка окружения

### Шаг 1: Создание структуры проекта

```bash
# Создаем корневую папку проекта
mkdir my-microservices
cd my-microservices

# Инициализируем npm проект (создает package.json)
npm init -y

# Создаем папки для двух сервисов
# - auth-service: сервер аутентификации
# - profile-service: сервер профилей
mkdir auth-service profile-service

# Создаем внутреннюю структуру для Auth Service
mkdir -p auth-service/{database,routers,public}

# Создаем внутреннюю структуру для Profile Service
mkdir -p profile-service/{database,middleware,routes/api,public}
```

**Что мы сделали?**
- `auth-service` - будет обрабатывать запросы на порту 3000
- `profile-service` - будет обрабатывать запросы на порту 3001
- `database` - папки для работы с PostgreSQL
- `routers/routes` - для определения URL маршрутов
- `public` - для HTML, CSS и JS файлов

### Шаг 2: Настройка package.json (корневой)

```json
{
  "name": "my-microservices",
  "version": "1.0.0",
  "type": "module",  // Включаем поддержку ES модулей (import/export вместо require)
  "scripts": {
    "auth": "node auth-service/server.js",     // Команда для запуска auth сервера
    "profile": "node profile-service/server.js" // Команда для запуска profile сервера
  },
  "dependencies": {
    "@fastify/cors": "^11.2.0",     // Для CORS в Fastify
    "bcrypt": "^6.0.0",              // Для хеширования паролей
    "dotenv": "^17.4.2",             // Для загрузки .env файла
    "express": "^5.2.1",             // Веб-фреймворк для Auth Service
    "fastify": "^5.8.5",             // Веб-фреймворк для Profile Service
    "jsonwebtoken": "^9.0.3",        // Для создания и проверки JWT токенов
    "pg": "^8.20.0"                  // PostgreSQL драйвер
  }
}
```

### Шаг 3: Настройка переменных окружения (.env)

Создайте файл `.env` в корне проекта:

```env
# URL подключения к PostgreSQL базе данных
# sslmode=require - требует SSL соединение (нужно для облачных БД)
DATABASE_URL=postgresql://user:password@host:port/database

# Секретный ключ для подписи JWT токенов
# Должен быть сложным и храниться в секрете!
JWT_SECRET=my_super_secret_key_change_this_to_something_secure

# URL Profile Service (для вызовов из Auth Service)
PROFILE_SERVICE_URL=http://localhost:3001

# Порты для запуска сервисов
AUTH_PORT=3000
PROFILE_PORT=3001
```

## 🏗 Создание Auth Service

Auth Service - это сервер на Express.js, который:
1. Принимает запросы на регистрацию
2. Проверяет логин/пароль при входе
3. Выдает JWT токены
4. Отдает HTML страницы

### Шаг 1: База данных Auth Service

**Файл:** `auth-service/database/database.js`

```javascript
// Импортируем PostgreSQL клиент
import pg from "pg";

// Деструктуризируем Pool (пул соединений) из модуля pg
// Пул позволяет эффективно переиспользовать подключения к БД
const { Pool } = pg;

// Глобальная переменная для хранения пула соединений
// Используем let, так как значение будет присвоено позже
let pool;

/**
 * Функция инициализации базы данных
 * Должна быть вызвана ПЕРЕД запуском сервера
 * 
 * Что делает:
 * 1. Создает пул соединений с PostgreSQL
 * 2. Создает таблицу users, если она не существует
 * 3. Возвращает пул для использования в других модулях
 */
export async function initDatabase() {
    // Создаем новый пул соединений
    // connectionString - полный URL для подключения к БД из .env файла
    // ssl: { rejectUnauthorized: false } - разрешает самоподписанные SSL сертификаты
    // (нужно для облачных БД, например, на Render.com)
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    // SQL запрос для создания таблицы пользователей
    // IF NOT EXISTS - не создавать, если уже существует
    // SERIAL - автоинкрементируемое целое число
    // TEXT UNIQUE NOT NULL - текст, уникальный, обязательный
    // TIMESTAMP DEFAULT CURRENT_TIMESTAMP - автоматическая метка времени
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,           -- Уникальный ID пользователя
            login TEXT UNIQUE NOT NULL,       -- Логин (не может повторяться)
            password TEXT NOT NULL,           -- Хешированный пароль
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Дата регистрации
        )
    `);
    
    // Логируем успешное подключение
    console.log('✅ Auth DB: PostgreSQL готов к работе');
    
    // Возвращаем пул, чтобы другие модули могли его использовать
    return pool;
}

/**
 * Геттер для получения пула соединений
 * Используется в других модулях (например, в api.js)
 * 
 * @returns {Pool} - пул соединений PostgreSQL
 */
export async function getDB() {
    return pool;
}
```

**Пояснение:** 
- `Пул соединений` - это набор заранее созданных подключений к БД
- Вместо того чтобы открывать новое подключение на каждый запрос, мы переиспользуем существующие
- Это значительно ускоряет работу приложения

### Шаг 2: API Роутер Auth Service

**Файл:** `auth-service/routers/api.js`

```javascript
// Импортируем необходимые модули
import express from "express";           // Веб-фреймворк
import jwt from "jsonwebtoken";          // Для создания JWT токенов
import bcrypt from 'bcrypt';             // Для хеширования паролей
import { getDB } from '../database/database.js';  // Наша функция получения БД

// Создаем роутер - мини-приложение для группировки маршрутов
// Все маршруты в этом файле будут начинаться с /api
const router = express.Router();

/**
 * РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ
 * URL: POST /api/register
 * 
 * Что происходит:
 * 1. Получаем логин и пароль из тела запроса
 * 2. Хешируем пароль (безопасное хранение)
 * 3. Сохраняем пользователя в БД
 * 4. Автоматически создаем профиль в Profile Service
 * 5. Возвращаем успешный ответ
 */
router.post("/register", async (req, res) => {
    // Извлекаем login и password из тела запроса
    // req.body - содержит данные, отправленные клиентом (в формате JSON)
    const { login, password } = req.body;
    
    // Получаем подключение к базе данных
    const db = await getDB();
    
    // ХЕШИРОВАНИЕ ПАРОЛЯ
    // bcrypt.hash(пароль, соль) - преобразует пароль в безопасную строку
    // 10 - количество раундов хеширования (чем больше, тем безопаснее, но медленнее)
    // Хеширование нужно, чтобы пароли не хранились в открытом виде в БД
    const hashedPassword = await bcrypt.hash(password, 10);
    
    try {
        // ВСТАВКА ПОЛЬЗОВАТЕЛЯ В БАЗУ ДАННЫХ
        // $1, $2 - параметризованные запросы (защита от SQL инъекций)
        // RETURNING * - возвращаем все поля созданной записи
        const result = await db.query(
            'INSERT INTO users (login, password) VALUES ($1, $2) RETURNING id, login, created_at',
            [login, hashedPassword]
        );
        
        // Получаем данные созданного пользователя
        const newUser = result.rows[0];
        
        // СОЗДАНИЕ ПРОФИЛЯ В PROFILE SERVICE
        // Отправляем запрос к другому микросервису (Profile Service)
        // Не используем await - не ждем ответа, чтобы не задерживать регистрацию
        // Это называется "асинхронный вызов" (fire and forget)
        fetch(`${process.env.PROFILE_SERVICE_URL}/api/profile`, {
            method: 'POST',                      // HTTP метод
            headers: { 'Content-Type': 'application/json' },  // Тип данных
            body: JSON.stringify({               // Тело запроса
                user_id: newUser.id,             // ID из Auth Service
                full_name: login                 // Временное имя из логина
            })
        }).catch(() => {});  // Игнорируем ошибки (профиль можно создать позже)
        
        // Отправляем успешный ответ клиенту
        res.json({ success: true });
        
    } catch (err) {
        // Ошибка: пользователь с таким логином уже существует
        // Код 400 (Bad Request) - ошибка на стороне клиента
        res.status(400).json({ success: false });
    }
});

/**
 * ВХОД ПОЛЬЗОВАТЕЛЯ В СИСТЕМУ
 * URL: POST /api/login
 * 
 * Что происходит:
 * 1. Находим пользователя в БД по логину
 * 2. Проверяем пароль
 * 3. Генерируем JWT токен
 * 4. Отправляем токен и данные пользователя
 */
router.post("/login", async (req, res) => {
    // Получаем логин и пароль из запроса
    const { login, password } = req.body;
    
    // Подключаемся к БД
    const db = await getDB();
    
    // Ищем пользователя по логину
    // $1 - параметр, который подставляется из массива [login]
    const result = await db.query('SELECT * FROM users WHERE login = $1', [login]);
    const user = result.rows[0];  // Получаем первого (и единственного) пользователя
    
    // ПРОВЕРКА ПАРОЛЯ
    // Если пользователь не найден ИЛИ пароль не совпадает
    if (!user || !(await bcrypt.compare(password, user.password))) {
        // 401 Unauthorized - неавторизованный доступ
        return res.status(401).json({ success: false });
    }
    
    // ГЕНЕРАЦИЯ JWT ТОКЕНА
    // jwt.sign(данные_для_шифрования, секретный_ключ, опции)
    // Токен будет содержать ID пользователя и логин
    // expiresIn: '24h' - токен действителен 24 часа
    const token = jwt.sign(
        { userId: user.id, login: user.login },  // Полезная нагрузка (payload)
        process.env.JWT_SECRET,                   // Секретный ключ для подписи
        { expiresIn: '24h' }                      // Время жизни токена
    );
    
    // Отправляем успешный ответ
    // Токен сохранится на клиенте (в sessionStorage)
    res.json({ 
        success: true, 
        token,                                    // JWT токен для аутентификации
        user: { 
            id: user.id, 
            login: user.login 
        } 
    });
});

// Экспортируем роутер для использования в основном сервере
export default router;
```

**Пояснение важных концепций:**

**JWT (JSON Web Token)** - это зашифрованная строка, которая содержит информацию о пользователе. Она подписана секретным ключом, поэтому её нельзя подделать. Токен отправляется с каждым запросом к Profile Service для подтверждения личности.

**Bcrypt** - алгоритм хеширования паролей. Хеш - это "отпечаток" пароля, который невозможно превратить обратно в оригинал. При входе мы хешируем введенный пароль и сравниваем с хешем из БД.

**Параметризованные запросы** (`$1`, `$2`) - защищают от SQL инъекций, когда злоумышленник пытается внедрить вредоносный SQL код в поля ввода.

### Шаг 3: Маршруты для HTML страниц

**Файл:** `auth-service/routers/pages.js`

```javascript
// Импортируем модули для работы с путями
import express from "express";
import path from 'path';           // Для создания корректных путей к файлам
import { fileURLToPath } from 'url';  // Для получения __dirname в ES модулях

// В ES модулях нет переменной __dirname (как в CommonJS)
// Поэтому мы создаем её вручную
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Создаем роутер для страниц
const router = express.Router();

/**
 * ГЛАВНАЯ СТРАНИЦА (СТРАНИЦА ВХОДА)
 * URL: GET /
 * 
 * Отправляет HTML файл с формой для входа/регистрации
 */
router.get('/', (req, res) => {
    // path.join - склеивает части пути с правильными разделителями (/ или \)
    // __dirname - текущая директория (/auth-service/routers)
    // "../public/index.html" - поднимаемся на уровень выше и заходим в public
    res.sendFile(path.join(__dirname, "../public", "index.html"));
});

/**
 * СТРАНИЦА ЛИЧНОГО КАБИНЕТА
 * URL: GET /dashboard
 * 
 * Отправляет HTML файл с дашбордом (только для авторизованных)
 */
router.get('/dashboard', (req, res) => {
    // Отправляем dashboard.html
    res.sendFile(path.join(__dirname, "../public", "dashboard.html"));
});

// Экспортируем роутер
export default router;
```

### Шаг 4: Главный сервер Auth Service

**Файл:** `auth-service/server.js`

```javascript
// Импортируем необходимые модули
import express from "express";      // Веб-фреймворк
import 'dotenv/config';             // Загружаем переменные из .env файла
import pageRouter from "./routers/pages.js";  // Роутер для HTML страниц
import apiRouter from "./routers/api.js";     // Роутер для API
import { initDatabase } from './database/database.js';  // Инициализация БД
import path from 'path';            // Для работы с путями
import { fileURLToPath } from 'url'; // Для __dirname

// Получаем путь к текущей директории
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Создаем экземпляр Express приложения
const app = express();

// Порт берем из .env, если не задан - используем 3000
const port = process.env.AUTH_PORT || 3000;

// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// await - ждем, пока БД подключится и создаст таблицы
// Это должно произойти ДО запуска сервера
await initDatabase();

// --- МИДЛВАРЫ (Middleware) ---
// Middleware - функции, которые выполняются перед обработкой маршрута

// express.json() - парсит JSON из тела запроса и добавляет в req.body
// Нужно, чтобы мы могли получать данные из POST запросов
app.use(express.json());

// express.static() - отдает статические файлы (CSS, JS) из папки public
// Не нужно писать отдельные маршруты для каждого файла
app.use(express.static(path.join(__dirname, "public")));

// --- ПОДКЛЮЧЕНИЕ РОУТЕРОВ ---
// Все запросы, начинающиеся с /api, идут в apiRouter
// Например: /api/register, /api/login
app.use("/api", apiRouter);

// Все остальные запросы (/, /dashboard) идут в pageRouter
app.use("/", pageRouter);

// --- ЗАПУСК СЕРВЕРА ---
// Слушаем входящие соединения на указанном порту
app.listen(port, () => {
    console.log(`🚀 Auth Service: http://localhost:${port}`);
});
```

**Пояснение мидлваров:**
- **Middleware** - это функции, которые могут обработать запрос ДО того, как он попадет в нужный маршрут
- Они могут изменить `req` (запрос) или `res` (ответ)
- `app.use()` - добавляет мидлвар для всех запросов

## 🏗 Создание Profile Service

Profile Service - это сервер на Fastify, который:
1. Хранит профили пользователей (полное имя, биография, дата рождения)
2. Требует JWT токен для доступа
3. Поддерживает CRUD операции (Create, Read, Update, Delete)

### Шаг 1: База данных Profile Service

**Файл:** `profile-service/database/database.js`

```javascript
// Импортируем PostgreSQL клиент
import pg from "pg";

// Пул соединений для переиспользования подключений
const { Pool } = pg;

// Глобальная переменная для пула
let pool;

/**
 * ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ PROFILE SERVICE
 * 
 * Создает таблицу profiles, где будут храниться:
 * - user_id: ID из Auth Service (связь между сервисами)
 * - full_name: полное имя пользователя
 * - bio: краткая биография
 * - birth_date: дата рождения
 */
export async function initDatabase() {
    // Создаем пул соединений (аналогично Auth Service)
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    // SQL запрос для создания таблицы профилей
    // UNIQUE - один пользователь не может иметь несколько профилей
    await pool.query(`
        CREATE TABLE IF NOT EXISTS profiles (
            id SERIAL PRIMARY KEY,                    -- Уникальный ID профиля
            user_id INTEGER UNIQUE NOT NULL,          -- ID из Auth Service (уникальный!)
            full_name VARCHAR(100),                   -- Полное имя (макс 100 символов)
            bio TEXT,                                 -- Биография (текст)
            birth_date DATE,                          -- Дата рождения
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Дата создания
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- Дата обновления
        )
    `);
    
    console.log('✅ Profile DB: PostgreSQL готов');
    return pool;
}

/**
 * Геттер для получения пула соединений
 * Используется в profile.js для запросов к БД
 */
export function getDB() {
    return pool;
}
```

### Шаг 2: JWT проверка (Middleware)

**Файл:** `profile-service/middleware/auth.js`

```javascript
// Импортируем библиотеку для работы с JWT
import jwt from 'jsonwebtoken';

/**
 * MIDDLEWARE ДЛЯ ПРОВЕРКИ JWT ТОКЕНА
 * 
 * Эта функция будет вызываться ДО обработки защищенных маршрутов
 * Она проверяет, что пользователь авторизован
 * 
 * @param {object} request - объект запроса Fastify
 * @param {object} reply - объект ответа Fastify
 */
export async function verifyJWT(request, reply) {
    try {
        // Получаем заголовок Authorization
        // Ожидаемый формат: "Bearer eyJhbGciOiJIUzI1NiIs..."
        const authHeader = request.headers.authorization;
        
        // Проверяем, есть ли заголовок и начинается ли он с "Bearer "
        // ?. - optional chaining (безопасная проверка существования)
        if (!authHeader?.startsWith('Bearer ')) {
            // 401 Unauthorized - пользователь не предоставил токен
            return reply.status(401).send({ success: false });
        }
        
        // Извлекаем токен (обрезаем "Bearer " в начале)
        // "Bearer token123" -> "token123"
        const token = authHeader.split(' ')[1];
        
        // ВЕРИФИКАЦИЯ ТОКЕНА
        // jwt.verify() проверяет подпись и срок действия
        // Если токен просрочен или подделан - выбросит ошибку
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Сохраняем расшифрованные данные в объект запроса
        // Теперь в обработчиках маршрута будет доступен request.user
        // request.user содержит { userId, login, iat, exp }
        request.user = decoded;
        
    } catch (err) {
        // Любая ошибка верификации (просрочка, неверная подпись)
        return reply.status(401).send({ success: false });
    }
}
```

**Пояснение:** 
- JWT токен содержит зашифрованные данные о пользователе
- Расшифровать токен может только сервер, знающий `JWT_SECRET`
- Если токен подделан - верификация не пройдет

### Шаг 3: API для работы с профилем

**Файл:** `profile-service/routes/api/profile.js`

```javascript
// Импортируем функцию для получения БД
import { getDB } from '../../database/database.js';

/**
 * МАРШРУТЫ ДЛЯ РАБОТЫ С ПРОФИЛЕМ
 * 
 * Этот файл экспортирует функцию, которая регистрирует все API маршруты
 * 
 * @param {object} fastify - экземпляр Fastify (с декорированным verifyJWT)
 */
export default async function profileRoutes(fastify) {
    
    /**
     * ПОЛУЧИТЬ ПРОФИЛЬ
     * GET /api/profile
     * 
     * Требует JWT токен в заголовке Authorization
     * Возвращает профиль текущего пользователя
     */
    fastify.get('/api/profile', { preHandler: fastify.verifyJWT }, async (request, reply) => {
        // Получаем user_id из токена (добавлено в verifyJWT)
        const userId = request.user.userId;
        
        // Ищем профиль в БД
        const result = await getDB().query(
            'SELECT * FROM profiles WHERE user_id = $1',
            [userId]
        );
        
        // Если профиль не найден - 404 Not Found
        if (!result.rows.length) {
            return reply.status(404).send({ success: false });
        }
        
        // Возвращаем найденный профиль
        return { success: true, profile: result.rows[0] };
    });
    
    /**
     * СОЗДАТЬ ИЛИ ОБНОВИТЬ ПРОФИЛЬ
     * POST /api/profile
     * 
     * Требует JWT токен
     * Если профиль существует - обновляет, если нет - создает
     * Это называется UPSERT (UPDATE + INSERT)
     */
    fastify.post('/api/profile', { preHandler: fastify.verifyJWT }, async (request) => {
        // Получаем данные из токена и из тела запроса
        const userId = request.user.userId;
        const { full_name, bio, birth_date } = request.body;
        
        // UPSERT запрос: 
        // - Пытаемся вставить новую запись
        // - Если запись с таким user_id уже существует - обновляем
        const result = await getDB().query(
            `INSERT INTO profiles (user_id, full_name, bio, birth_date)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                bio = EXCLUDED.bio,
                birth_date = EXCLUDED.birth_date,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [userId, full_name, bio, birth_date]
        );
        
        // Возвращаем созданный/обновленный профиль
        return { success: true, profile: result.rows[0] };
    });
    
    /**
     * УДАЛИТЬ ПРОФИЛЬ
     * DELETE /api/profile
     * 
     * Требует JWT токен
     * Удаляет профиль текущего пользователя
     */
    fastify.delete('/api/profile', { preHandler: fastify.verifyJWT }, async (request, reply) => {
        const userId = request.user.userId;
        
        // Удаляем профиль и возвращаем удаленную запись
        const result = await getDB().query(
            'DELETE FROM profiles WHERE user_id = $1 RETURNING *',
            [userId]
        );
        
        // Если ничего не удалили (профиля не было) - 404
        if (!result.rows.length) {
            return reply.status(404).send({ success: false });
        }
        
        return { success: true };
    });
}
```

**Пояснение UPSERT:**
- `ON CONFLICT (user_id)` - если возникает конфликт уникальности
- `EXCLUDED` - специальная таблица с данными, которые пытались вставить
- `RETURNING *` - после операции вернуть все поля записи

### Шаг 4: Главный сервер Profile Service

**Файл:** `profile-service/server.js`

```javascript
// Импортируем Fastify - быстрый и легковесный веб-фреймворк
import Fastify from 'fastify';
import 'dotenv/config';              // Загружаем переменные окружения
import cors from '@fastify/cors';    // CORS плагин для Fastify
import { initDatabase } from './database/database.js';
import { verifyJWT } from './middleware/auth.js';
import profileRoutes from './routes/api/profile.js';

// СОЗДАНИЕ ЭКЗЕМПЛЯРА FASTIFY
// { logger: false } - отключаем встроенное логирование (для минимализма)
const fastify = Fastify({ logger: false });

// НАСТРОЙКА CORS (Cross-Origin Resource Sharing)
// origin: true - разрешаем запросы с любых источников (для разработки)
// Без CORS браузер заблокирует запросы с порта 3000 на порт 3001
await fastify.register(cors, { origin: true });

// ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
// Создает таблицу profiles, если её нет
await initDatabase();

// ДЕКОРИРОВАНИЕ FASTIFY
// fastify.decorate() - добавляет новый метод в экземпляр Fastify
// Теперь везде в роутах доступно fastify.verifyJWT
fastify.decorate('verifyJWT', verifyJWT);

// РЕГИСТРАЦИЯ МАРШРУТОВ
// Все маршруты из profileRoutes будут добавлены в приложение
await fastify.register(profileRoutes);

// Получаем порт из .env, по умолчанию 3001
const port = process.env.PROFILE_PORT || 3001;

// ЗАПУСК СЕРВЕРА
// host: '0.0.0.0' - слушаем на всех сетевых интерфейсах
// (нужно для доступа из Docker и с других устройств)
fastify.listen({ port, host: '0.0.0.0' }, () => {
    console.log(`🚀 Profile Service: http://localhost:${port}`);
});
```

**Пояснение CORS:**
- Браузер запрещает JavaScript делать запросы на другой порт/домен (политика same-origin)
- CORS заголовки говорят браузеру "этот сервер разрешает запросы с других источников"
- Без CORS мы не смогли бы из `localhost:3000` вызывать API на `localhost:3001`

## 🎨 Фронтенд часть

### HTML Страницы

#### Страница входа (`auth-service/public/index.html`)

```html
<!-- 
    СТРАНИЦА АВТОРИЗАЦИИ
    Предлагает пользователю формы для входа и регистрации
-->
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Авторизация</title>
    <!-- Подключаем CSS для стилизации -->
    <link rel="stylesheet" href="/auth.css">
</head>
<body>
    <!-- Основной контейнер для центрирования -->
    <div class="auth-container">
        <!-- Карточка с формами -->
        <div class="auth-card">
            <h1>🔐 Добро пожаловать</h1>
            
            <!-- Форма (без action, отправка через JavaScript) -->
            <form id="authForm">
                <!-- Поле ввода логина -->
                <div class="input-group">
                    <input type="text" id="login" placeholder="Логин" required>
                </div>
                
                <!-- Поле ввода пароля -->
                <div class="input-group">
                    <input type="password" id="password" placeholder="Пароль" required>
                </div>
                
                <!-- Кнопки действий -->
                <div class="button-group">
                    <button type="button" class="btn-login" onclick="login()">Вход</button>
                    <button type="button" class="btn-register" onclick="register()">Регистрация</button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- Подключаем JavaScript для обработки событий -->
    <script src="/script.js"></script>
</body>
</html>
```

#### Страница дашборда (`auth-service/public/dashboard.html`)

```html
<!-- 
    ЛИЧНЫЙ КАБИНЕТ ПОЛЬЗОВАТЕЛЯ
    Доступен только после успешного входа
-->
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Личный кабинет</title>
    <link rel="stylesheet" href="/dashboard.css">
</head>
<body>
    <div class="dashboard-container">
        <div class="dashboard-card">
            
            <!-- ШАПКА С ЗАГОЛОВКОМ И КНОПКОЙ ВЫХОДА -->
            <div class="header">
                <h1>👤 Личный кабинет</h1>
                <button class="btn-logout" onclick="logout()">Выйти</button>
            </div>
            
            <!-- СЕКЦИЯ: ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ -->
            <div class="user-info-section">
                <h2>Информация о пользователе</h2>
                <div id="userInfo" class="user-info">
                    <!-- Данные подгрузятся через JavaScript -->
                </div>
            </div>
            
            <!-- СЕКЦИЯ: ПРОФИЛЬ -->
            <div class="profile-section">
                <h2>Мой профиль</h2>
                
                <!-- Блок для отображения профиля -->
                <div id="profileInfo" class="profile-info">
                    <!-- Профиль подгружается через JS -->
                </div>
                
                <!-- Блок для редактирования (скрыт по умолчанию) -->
                <div id="profileForm" class="profile-form" style="display: none;">
                    <input type="text" id="fullName" placeholder="Полное имя">
                    <textarea id="bio" placeholder="О себе" rows="3"></textarea>
                    <input type="date" id="birthDate">
                    <div class="form-buttons">
                        <button class="btn-save" onclick="saveProfile()">Сохранить</button>
                        <button class="btn-cancel" onclick="cancelEdit()">Отмена</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script src="/dashboard.js"></script>
</body>
</html>
```

### JavaScript Клиенты

#### Скрипт для страницы входа (`auth-service/public/script.js`)

```javascript
/**
 * РЕГИСТРАЦИЯ НОВОГО ПОЛЬЗОВАТЕЛЯ
 * 
 * Что делает:
 * 1. Забирает логин и пароль из полей ввода
 * 2. Отправляет POST запрос на /api/register
 * 3. Показывает результат операции
 */
async function register() {
    // Получаем значения из полей ввода
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    
    // Отправляем запрос к серверу
    const response = await fetch("/api/register", {
        method: "POST",                      // HTTP метод
        headers: { "Content-Type": "application/json" },  // Отправляем JSON
        body: JSON.stringify({ login, password })  // Превращаем объект в JSON строку
    });
    
    // Парсим ответ сервера
    const data = await response.json();
    
    // Показываем сообщение пользователю
    alert(data.success ? '✅ Регистрация успешна!' : '❌ Ошибка регистрации');
}

/**
 * ВХОД ПОЛЬЗОВАТЕЛЯ В СИСТЕМУ
 * 
 * Что делает:
 * 1. Забирает логин и пароль
 * 2. Отправляет запрос на /api/login
 * 3. Если успешно - сохраняет токен и перенаправляет на дашборд
 */
async function login() {
    // Получаем данные из формы
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    
    // Отправляем запрос на вход
    const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
        // СОХРАНЯЕМ ДАННЫЕ В sessionStorage
        // sessionStorage хранит данные до закрытия вкладки
        // token - нужен для авторизации запросов
        // user - информация о пользователе (для отображения)
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        
        // Перенаправляем на защищенную страницу
        window.location.href = '/dashboard';
    } else {
        // Неверный логин или пароль
        alert('❌ Неверный логин или пароль');
    }
}

/**
 * АВТОМАТИЧЕСКОЕ ПЕРЕНАПРАВЛЕНИЕ
 * 
 * Если пользователь уже вошел (есть user в sessionStorage)
 * и открывает страницу входа - сразу отправляем его на дашборд
 */
window.onload = () => {
    const user = sessionStorage.getItem('user');
    if (user && window.location.pathname === '/') {
        window.location.href = '/dashboard';
    }
};
```

#### Скрипт для дашборда (`auth-service/public/dashboard.js`)

```javascript
// Глобальная переменная для хранения текущего профиля
// Нужна, чтобы при открытии формы редактирования заполнить поля
let currentProfile = null;

/**
 * ЗАГРУЗКА ПРОФИЛЯ ПОЛЬЗОВАТЕЛЯ
 * 
 * Отправляет запрос к Profile Service с JWT токеном
 * Если профиль есть - отображает, если нет - предлагает создать
 */
async function loadProfile() {
    // Получаем токен из sessionStorage (сохраняется при входе)
    const token = sessionStorage.getItem('token');
    
    try {
        // Запрос к Profile Service (порт 3001)
        // В заголовке Authorization передаем токен
        const res = await fetch('http://localhost:3001/api/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Обрабатываем ответ
        if (res.status === 404) {
            // Профиль не найден - показываем кнопку "Создать"
            displayNoProfile();
        } else if (res.ok) {
            // Профиль найден - отображаем его
            const data = await res.json();
            currentProfile = data.profile;  // Сохраняем для редактирования
            displayProfile(data.profile);
        }
    } catch (err) {
        console.error('Ошибка загрузки профиля:', err);
    }
}

/**
 * ОТОБРАЖЕНИЕ ПРОФИЛЯ
 * 
 * Создает HTML структуру с данными профиля
 * и кнопками "Редактировать" и "Удалить"
 */
function displayProfile(profile) {
    document.getElementById('profileInfo').innerHTML = `
        <div class="profile-details">
            <p><strong>Полное имя:</strong> ${profile.full_name || '—'}</p>
            <p><strong>О себе:</strong> ${profile.bio || '—'}</p>
            <p><strong>Дата рождения:</strong> ${profile.birth_date || '—'}</p>
        </div>
        <div class="profile-actions">
            <button class="btn-edit" onclick="showEditForm()">✏️ Редактировать</button>
            <button class="btn-delete" onclick="deleteProfile()">🗑️ Удалить</button>
        </div>
    `;
}

/**
 * ОТОБРАЖЕНИЕ СООБЩЕНИЯ "ПРОФИЛЬ НЕ НАЙДЕН"
 * 
 * Показывает кнопку для создания профиля
 */
function displayNoProfile() {
    document.getElementById('profileInfo').innerHTML = `
        <p class="no-profile">Профиль не найден</p>
        <button class="btn-create" onclick="showEditForm()">➕ Создать профиль</button>
    `;
}

/**
 * ПОКАЗАТЬ ФОРМУ РЕДАКТИРОВАНИЯ
 * 
 * Скрывает блок с отображением профиля
 * Показывает форму
 * Если профиль существует - заполняет поля существующими данными
 */
function showEditForm() {
    // Скрываем блок отображения
    document.getElementById('profileInfo').style.display = 'none';
    // Показываем форму редактирования
    document.getElementById('profileForm').style.display = 'block';
    
    // Если профиль существует - заполняем поля
    if (currentProfile) {
        document.getElementById('fullName').value = currentProfile.full_name || '';
        document.getElementById('bio').value = currentProfile.bio || '';
        document.getElementById('birthDate').value = currentProfile.birth_date || '';
    }
}

/**
 * ОТМЕНА РЕДАКТИРОВАНИЯ
 * 
 * Скрывает форму, показывает блок с профилем
 * Перезагружает профиль (на случай, если были изменения)
 */
function cancelEdit() {
    document.getElementById('profileInfo').style.display = 'block';
    document.getElementById('profileForm').style.display = 'none';
    loadProfile();  // Перезагружаем для отображения актуальных данных
}

/**
 * СОХРАНЕНИЕ ПРОФИЛЯ
 * 
 * Отправляет POST запрос с данными из формы
 * Если успешно - закрывает форму и обновляет отображение
 */
async function saveProfile() {
    const token = sessionStorage.getItem('token');
    
    // Собираем данные из формы
    const profileData = {
        full_name: document.getElementById('fullName').value,
        bio: document.getElementById('bio').value,
        birth_date: document.getElementById('birthDate').value
    };
    
    // Отправляем запрос на сохранение
    const res = await fetch('http://localhost:3001/api/profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
    });
    
    if (res.ok) {
        alert('✅ Профиль сохранен');
        cancelEdit();  // Закрываем форму и обновляем
    } else {
        alert('❌ Ошибка сохранения');
    }
}

/**
 * УДАЛЕНИЕ ПРОФИЛЯ
 * 
 * Запрашивает подтверждение
 * Отправляет DELETE запрос
 * Если успешно - перезагружает страницу профиля
 */
async function deleteProfile() {
    // Подтверждение действия
    if (!confirm('Удалить профиль? Это действие нельзя отменить.')) return;
    
    const token = sessionStorage.getItem('token');
    const res = await fetch('http://localhost:3001/api/profile', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
        alert('✅ Профиль удален');
        loadProfile();  // Перезагружаем (покажет сообщение "Профиль не найден")
    } else {
        alert('❌ Ошибка удаления');
    }
}

/**
 * ВЫХОД ИЗ СИСТЕМЫ
 * 
 * Очищает sessionStorage и перенаправляет на главную
 */
function logout() {
    sessionStorage.clear();  // Удаляем token и user
    window.location.href = '/';  // Переход на страницу входа
}

/**
 * ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
 * 
 * 1. Проверяет, авторизован ли пользователь
 * 2. Отображает информацию о пользователе
 * 3. Загружает профиль
 */
window.onload = () => {
    // Получаем данные пользователя из sessionStorage
    const user = JSON.parse(sessionStorage.getItem('user'));
    
    // Если не авторизован - отправляем на страницу входа
    if (!user) window.location.href = '/';
    
    // Отображаем информацию о пользователе
    document.getElementById('userInfo').innerHTML = `
        <p><strong>👤 Логин:</strong> ${user.login}</p>
        <p><strong>🆔 ID:</strong> ${user.id}</p>
    `;
    
    // Загружаем профиль из Profile Service
    loadProfile();
};
```

## 🚀 Запуск и тестирование

### Команды для запуска

```bash
# Установка всех зависимостей
npm install

# Запуск Auth Service (в отдельном терминале)
npm run auth

# Запуск Profile Service (в другом терминале)
npm run profile
```

### Проверка работоспособности

1. **Откройте браузер** → `http://localhost:3000`
2. **Зарегистрируйте нового пользователя**
3. **Выполните вход** с тем же логином/паролем
4. **Создайте профиль** на дашборде
5. **Проверьте** - профиль сохранился и отображается

### Ожидаемый результат

```
Auth Service: http://localhost:3000
Profile Service: http://localhost:3001

В консоли терминалов:
✅ Auth DB: PostgreSQL готов
✅ Profile DB: PostgreSQL готов
🚀 Auth Service: http://localhost:3000
🚀 Profile Service: http://localhost:3001
```

## 🎨 Стилизация

### CSS для страницы авторизации (`auth-service/public/auth.css`)

```css
/* 
   СТИЛИ ДЛЯ СТРАНИЦЫ АВТОРИЗАЦИИ
   Современный дизайн с градиентами и анимациями
*/

/* Сброс стандартных отступов у всех элементов */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;  /* Учитываем padding и border в ширине элемента */
}

/* Стили для body - градиентный фон на всю высоту экрана */
body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;  /* Минимум на всю высоту экрана */
    display: flex;      /* Используем flexbox для центрирования */
    align-items: center; /* Центрирование по вертикали */
    justify-content: center; /* Центрирование по горизонтали */
    padding: 20px;
}

/* Контейнер для авторизации - ограничивает ширину формы */
.auth-container {
    width: 100%;
    max-width: 450px;
}

/* Карточка формы - белый блок с тенью */
.auth-card {
    background: white;
    border-radius: 20px;
    padding: 40px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.5s ease-out;  /* Анимация появления */
}

/* Анимация появления карточки (выезжает снизу) */
@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Заголовок карточки */
.auth-card h1 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
    font-size: 2em;
}

/* Группа полей ввода - отступ снизу */
.input-group {
    margin-bottom: 20px;
}

/* Стили для полей ввода */
.input-group input {
    width: 100%;
    padding: 12px 15px;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    font-size: 16px;
    transition: all 0.3s;
    outline: none;  /* Убираем стандартную обводку при фокусе */
}

/* Эффект при фокусе на поле ввода */
.input-group input:focus {
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* Группа кнопок - располагаем их в ряд */
.button-group {
    display: flex;
    gap: 15px;
    margin-top: 30px;
}

/* Общие стили для кнопок */
.btn-login, .btn-register {
    flex: 1;  /* Кнопки одинаковой ширины */
    padding: 12px;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
}

/* Кнопка входа - градиент */
.btn-login {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

/* Эффект при наведении на кнопку входа */
.btn-login:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

/* Кнопка регистрации - зеленая */
.btn-register {
    background: #48bb78;
    color: white;
}

/* Эффект при наведении на кнопку регистрации */
.btn-register:hover {
    background: #38a169;
    transform: translateY(-2px);
}

/* Адаптивность для мобильных устройств */
@media (max-width: 480px) {
    .auth-card {
        padding: 30px 20px;
    }
    
    /* На мобильных кнопки располагаем в столбик */
    .button-group {
        flex-direction: column;
    }
}
```

### CSS для дашборда (`auth-service/public/dashboard.css`)

```css
/*
    СТИЛИ ДЛЯ ЛИЧНОГО КАБИНЕТА
    Двухколоночная структура с информацией о пользователе и профиле
*/

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    padding: 20px;
}

/* Контейнер дашборда - центрирование и ограничение ширины */
.dashboard-container {
    max-width: 800px;
    margin: 0 auto;
}

/* Основная карточка дашборда */
.dashboard-card {
    background: white;
    border-radius: 20px;
    overflow: hidden;  /* Чтобы углы карточки были скруглены */
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideDown 0.5s ease-out;
}

/* Анимация появления (выезжает сверху) */
@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Шапка с градиентом */
.header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header h1 {
    font-size: 1.8em;
}

/* Кнопка выхода - полупрозрачная */
.btn-logout {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s;
}

.btn-logout:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
}

/* Секции с информацией */
.user-info-section, .profile-section {
    padding: 30px;
    border-bottom: 1px solid #f0f0f0;
}

/* Заголовки секций */
.user-info-section h2, .profile-section h2 {
    color: #333;
    margin-bottom: 20px;
    font-size: 1.3em;
}

/* Блок с информацией о пользователе */
.user-info {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 15px;
}

.user-info p {
    margin: 8px 0;
    color: #555;
    font-size: 16px;
}

.user-info strong {
    color: #667eea;
}

/* Блок с профилем */
.profile-info {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 15px;
}

/* Детали профиля */
.profile-details p {
    margin: 10px 0;
    color: #555;
    font-size: 15px;
}

.profile-details strong {
    display: inline-block;
    width: 100px;
    color: #667eea;
}

/* Сообщение "профиль не найден" */
.no-profile {
    text-align: center;
    color: #999;
    padding: 20px;
}

/* Группы кнопок действий */
.profile-actions, .form-buttons {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

/* Общие стили для кнопок действий */
.btn-edit, .btn-delete, .btn-create, .btn-save, .btn-cancel {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s;
}

/* Кнопка редактирования - синяя */
.btn-edit {
    background: #4299e1;
    color: white;
}

.btn-edit:hover {
    background: #3182ce;
    transform: translateY(-2px);
}

/* Кнопка удаления - красная */
.btn-delete {
    background: #f56565;
    color: white;
}

.btn-delete:hover {
    background: #e53e3e;
    transform: translateY(-2px);
}

/* Кнопка создания и сохранения - зеленая */
.btn-create, .btn-save {
    background: #48bb78;
    color: white;
    width: 100%;
}

.btn-create:hover, .btn-save:hover {
    background: #38a169;
    transform: translateY(-2px);
}

/* Кнопка отмены - серая */
.btn-cancel {
    background: #a0aec0;
    color: white;
}

.btn-cancel:hover {
    background: #718096;
    transform: translateY(-2px);
}

/* Форма редактирования профиля */
.profile-form {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 15px;
    margin-top: 20px;
}

/* Поля ввода в форме */
.profile-form input,
.profile-form textarea {
    width: 100%;
    padding: 12px;
    margin-bottom: 15px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    transition: all 0.3s;
    outline: none;
    font-family: inherit;
}

.profile-form input:focus,
.profile-form textarea:focus {
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.profile-form textarea {
    resize: vertical;
    min-height: 80px;
}

.form-buttons {
    margin-top: 20px;
}

/* Адаптивность для планшетов и телефонов */
@media (max-width: 600px) {
    /* На мобильных шапка в столбик */
    .header {
        flex-direction: column;
        gap: 15px;
        text-align: center;
    }
    
    /* Лейблы и значения в столбик */
    .profile-details strong {
        display: block;
        margin-bottom: 5px;
    }
    
    /* Кнопки действий в столбик */
    .profile-actions {
        flex-direction: column;
    }
    
    /* Уменьшаем отступы */
    .user-info-section, .profile-section {
        padding: 20px;
    }
}
```

## 📊 Диаграмма потока данных

```
1. РЕГИСТРАЦИЯ:
   Пользователь → POST /api/register → Auth Service
                                     ↓
                                Хеширование пароля
                                     ↓
                                Сохранение в БД
                                     ↓
                                Создание профиля в Profile Service
                                     ↓
                                Ответ "успешно"

2. ВХОД:
   Пользователь → POST /api/login → Auth Service
                                  ↓
                             Проверка пароля
                                  ↓
                             Генерация JWT
                                  ↓
                             Ответ { token, user }

3. ЗАГРУЗКА ПРОФИЛЯ:
   Dashboard (с токеном) → GET /api/profile → Profile Service
                                             ↓
                                        Проверка JWT
                                             ↓
                                        Запрос в БД
                                             ↓
                                        Ответ { profile }
```


## ✅ Заключение

Мы создали полностью работающую микросервисную систему с:
- ✅ Регистрацией и входом пользователей
- ✅ Безопасным хранением паролей (bcrypt)
- ✅ JWT аутентификацией
- ✅ Полным CRUD для профилей
- ✅ Современным адаптивным дизайном
- ✅ Чистой архитектурой с разделением ответственности

**Ключевые концепции:**
- Микросервисная архитектура
- JWT токены для аутентификации
- CORS для кросс-доменных запросов
- Асинхронное программирование (async/await)
- Работа с PostgreSQL параметризованными запросами
