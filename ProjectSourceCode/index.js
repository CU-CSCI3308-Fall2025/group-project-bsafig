const express = require('express');
const bodyParser = require('body-parser');
const pgp = require('pg-promise')();
const bcrypt = require('bcryptjs');
const axios = require('axios');
const session = require('express-session');
const exphbs = require('express-handlebars');
require('dotenv').config();

// Initialize app
const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'super duper secret!',
    resave: false,
    saveUninitialized: false
}));

// Database configuration
const dbConfig = {
    host: 'db',
    port: 5432,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
};
const db = pgp(dbConfig);
/*
    Handlebars setup 
    IMPORTANT: IF YOU WANT TO USE HANDLEBARS, ADD VIEWS FOLDERS
    IF NOT, REMOVE THIS SECTION
*/
app.engine('hbs', exphbs.engine({
    extname: 'hbs',
    defaultLayout: 'main',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials'
}));
app.set('view engine', 'hbs');
app.set('views', './views');

// Registration page
app.get('/register', (req, res) => {
    res.render('pages/register');
});

// Handle registration form
app.post('/register', async(req, res) => {
    try {
        const { username, email, password } = req.body;

        // Hash password
        const hash = await bcrypt.hash(password, 10);

        // Insert into database
        await db.none('INSERT INTO users(username, email, password) VALUES($1, $2, $3)', [username, email, hash]);

        /* redirect to homepage after successful registration
            res.redirect('/home');
        */
    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(500).send('Registration error');
    }
});