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


// Login page
app.get('/login', (req, res) => {
    res.render('pages/login', { message: null });
});

// Handle login form
app.post('/login', async(req, res) => {
    const { username, password } = req.body;

    try {
        const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);

        if (!user) {
            return res.redirect('/register');
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.render('pages/login', { message: 'Incorrect username or password.' });
        }

        req.session.user = user;
        req.session.save(err => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error saving session');
            }
            res.redirect('/home');
        });

    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).send('Server error');
    }
});

// Registration page
app.get('/register', (req, res) => {
    // If the user is already logged in, redirect them to the home page
    if (req.session.user) {
        return res.redirect('/home');
    }
    res.render('pages/register');
});

// Handle registration form
app.post('/register', async(req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.render('pages/register', { message: 'All fields are required.' });
    }

    try {
        const existingUser = await db.oneOrNone(
            'SELECT user_id FROM users WHERE username = $1 OR email = $2', [username, email]
        );

        if (existingUser) {
            return res.render('pages/register', {
                message: 'Username or Email already in use. Please choose a different one.'
            });
        }

        const hash = await bcrypt.hash(password, 10);

        await db.none(
            'INSERT INTO users(username, email, password_hash) VALUES($1, $2, $3)', [username, email, hash]
        );

        return res.render('pages/login', { message: 'Registration successful! Please log in.' });

    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(500).send('Registration error');
    }
});

// Authentication middleware
const auth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// require login for future routes
app.use(auth);

// Logout page
// GET Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/login');
    });
});

// Home page
app.get('/home', (req, res) => {
    res.render('pages/home', { user: req.session.user });
});

// Friends page
app.get('/friends', (req, res) => {
    res.render('pages/friends', { user: req.session.user });
});

// Port listener
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});