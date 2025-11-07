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

// Handlebars setup
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

// Require login for future routes
app.use(auth);

// Logout page
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

// Friends page (loads pending requests)
app.get('/friends', async(req, res) => {
    const currentUserId = req.session.user.user_id;

    try {

        const sentRequests = await db.any(
            `SELECT f.friend_id AS receiver_id, u.username
             FROM friendships f
             JOIN users u ON f.friend_id = u.user_id
             WHERE f.user_id = $1 AND f.status = 'pending'`, [currentUserId]
        );

        const pendingRequests = await db.any(
            `SELECT f.user_id AS sender_id, u.username
             FROM friendships f
             JOIN users u ON f.user_id = u.user_id
             WHERE f.friend_id = $1 AND f.status = 'pending'`, [currentUserId]
        );

        console.log('Sent requests for user', currentUserId, sentRequests);
        console.log('Pending requests for user', currentUserId, pendingRequests);

        res.render('pages/friends', {
            user: req.session.user,
            sentRequests,
            pendingRequests
        });
    } catch (error) {
        console.error('Error loading friends page:', error.message);
        res.status(500).send('Server error');
    }
});

// Search for users
app.get('/search-friends', async(req, res) => {
    const query = req.query.query;
    const currentUserId = req.session.user.user_id;

    if (!query || query.trim() === '') {
        return res.json([]);
    }

    try {
        const users = await db.any(
            `SELECT user_id, username 
             FROM users 
             WHERE username ILIKE $1 
             AND user_id != $2
             LIMIT 10`, [`%${query}%`, currentUserId]
        );

        res.json(users);
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send a friend request
app.post('/send-friend-request', async(req, res) => {
    const currentUserId = req.session.user.user_id;
    const { friend_id } = req.body;

    if (!friend_id || friend_id === currentUserId) {
        return res.status(400).json({ message: 'Invalid friend request.' });
    }

    try {
        const existing = await db.oneOrNone(
            `SELECT * FROM friendships 
             WHERE (user_id = $1 AND friend_id = $2)
             OR (user_id = $2 AND friend_id = $1)`, [currentUserId, friend_id]
        );

        if (existing) {
            return res.json({ message: 'Friend request already sent or friendship exists.' });
        }

        await db.none(
            `INSERT INTO friendships (user_id, friend_id, status)
             VALUES ($1, $2, 'pending')`, [currentUserId, friend_id]
        );

        res.json({ message: 'Friend request sent!' });
    } catch (error) {
        console.error('Friend request error:', error.message);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Accept a friend request
app.post('/accept-friend-request', async(req, res) => {
    const currentUserId = req.session.user.user_id;
    const { sender_id } = req.body;

    if (!sender_id) {
        return res.status(400).json({ message: 'Invalid request.' });
    }

    try {
        await db.none(
            `UPDATE friendships
             SET status = 'accepted'
             WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`, [sender_id, currentUserId]
        );

        res.json({ message: 'Friend request accepted!' });
    } catch (error) {
        console.error('Error accepting friend request:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject friend request route
app.post('/reject-friend-request', async(req, res) => {
    const currentUserId = req.session.user.user_id;
    const { sender_id } = req.body;

    try {
        await db.none(
            `DELETE FROM friendships
            WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`, [sender_id, currentUserId]
        );
        res.json({ message: 'Friend request rejected.' });
    } catch (error) {
        console.error('Error rejecting friend request:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

// Cancel sent friend request route
app.post('/cancel-friend-request', async(req, res) => {
    const currentUserId = req.session.user.user_id;
    const { receiver_id } = req.body;
    if (!receiver_id) return res.status(400).json({ message: 'Invalid request.' });

    try {
        await db.none(`
      DELETE FROM friendships
      WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'`, [currentUserId, receiver_id]);
        res.json({ message: 'Friend request canceled.' });
    } catch (error) {
        console.error('Error canceling friend request:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

// Port listener
const PORT = process.env.PORT || 3000;
// Assign the result of app.listen() (the HTTP server object) to a variable.
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// EXPORT THE SERVER INSTANCE
module.exports = server;