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
app.use(express.static('public'));

const DEFAULT_PROFILE_PIC = '/images/default-profile.png';

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


/* REGISTRATION ENDPOINTS */


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


/* SETTINGS ENDPOINTS */

// GET Settings View - authenticated user can edit their settings 
// TO DO: link to a button in profile.hbs
app.get('/profile/settings', (req, res) => { 
    res.render('pages/settings', { 
        user: req.session.user,
        message: null 
    });
});

// create 3 POST requests for 3 separate form changes
// POST Update Username
app.post('/profile/settings/updateUsername', async (req, res) => {
    const { newUsername } = req.body;
    const currentUserId = req.session.user.user_id;

    if (!newUsername || newUsername.trim() === '') {
        return res.render('pages/settings', { 
            user: req.session.user,
            message: 'Username cannot be empty.' 
        });
    }

    try {
        // is username already taken?
        const existingUser = await db.oneOrNone('SELECT user_id FROM users WHERE username = $1 AND user_id != $2', [newUsername, currentUserId]);

        if (existingUser) {
            return res.render('pages/settings', {
                user: req.session.user,
                message: 'This username is already taken. Please choose another one.'
            });
        }

        await db.none('UPDATE users SET username = $1 WHERE user_id = $2', [newUsername, currentUserId]);

        // update the session with the new user 
        req.session.user.username = newUsername;
        
        // reloads page for the user 
        return res.render('pages/settings', {
            user: req.session.user,
            message: 'Username successfully updated!'
        });

    } catch (error) {
        console.error('Update username error:', error.message);
        return res.status(500).render('pages/settings', {
            user: req.session.user,
            message: 'An error occurred while updating your username.'
        });
    }
});

// POST Update Password
app.post('/profile/settings/updatePassword', async (req, res) => {
    const { newPassword, confirmPassword } = req.body;
    const currentUserId = req.session.user.user_id;

    if (!newPassword || newPassword !== confirmPassword) {
        return res.render('pages/settings', {
            user: req.session.user,
            message: 'Passwords do not match or field is empty.'
        });
    }

    try {
        // hash the new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // update the password hash in the database
        await db.none('UPDATE users SET password_hash = $1 WHERE user_id = $2', [newPasswordHash, currentUserId]);

        // [consider optional if wanted], destroy and redirect to login to reauthenticate
        req.session.destroy(err => {
            if (err) {
                console.error('Logout error after password change:', err);
                return res.status(500).send('Password updated, but could not log out.');
            }
            
            res.render('pages/login', { message: 'Password successfully updated! Please log in again.' });
        });

    } catch (error) {
        console.error('Update password error:', error.message);
        // if an error occurs before destroy, render the settings page with an error
        if (!res.headersSent) {
            return res.status(500).render('pages/settings', {
                user: req.session.user,
                message: 'An error occurred while updating your password.'
            });
        }
    }
});

// POST Update Profile Picture URL
app.post('/profile/settings/updatePicture', async (req, res) => {
    const { profilePicUrl } = req.body;
    const currentUserId = req.session.user.user_id;
    // TO DO: a DEFAULT_PROFILE_PIC express object must be defined 
    const DEFAULT_PROFILE_PIC = 'TO DO'; 

    // use provided URL. if empty, use NULL which should revert to default
    const newProfilePicUrl = (profilePicUrl && profilePicUrl.trim() !== '') ? profilePicUrl : null;

    try {
        // update the profile_picture_url in the database
        await db.none('UPDATE users SET profile_picture_url = $1 WHERE user_id = $2', [newProfilePicUrl, currentUserId]);

        // update the session
        req.session.user.profile_pic_url = newProfilePicUrl;

        // refresh the page with a success message
        return res.render('pages/settings', {
            user: req.session.user,
            message: 'Profile picture successfully updated!'
        });

    } catch (error) {
        console.error('Update profile picture error:', error.message);
        return res.status(500).render('pages/settings', {
            user: req.session.user,
            message: 'An error occurred while updating your profile picture.'
        });
    }
});


/* PROFILE ENDPOINTS */

// GET Profile View (viewing a specific user's profile) 
app.get('/profile/:username', async (req, res) => {
    const targetUsername = req.params.username;
    const currentUserId = req.session.user.user_id;

    try {
        // Fetch the target user's details
        const targetUser = await db.oneOrNone('SELECT user_id, username, profile_picture_url FROM users WHERE username = $1', [targetUsername]);
        if (!targetUser) {
            return res.status(404).render('pages/error', { message: 'User not found.' });
        }

        // Check if this is the authenticated user's own profile
        const isOwnProfile = targetUser.user_id === currentUserId;

        // Fetch friend count 
        const friends = await db.one(
                `SELECT COUNT(*) AS friend_count 
                FROM friendships 
                WHERE status = 'accepted' AND 
                (user_id = $1)`, [req.session.user.user_id]
            );  
        friendCount = friends.friend_count

       // Fetch posts 
        const posts = await db.any(
                `SELECT content, created_at AS "createdAt"
                FROM reviews
                WHERE user_id = $1
                ORDER BY created_at DESC`, [req.session.user.user_id]
            );

        // Render the page
        res.render('pages/profile', {
            user: {
                id: targetUser.user_id,
                username: targetUser.username,
                // profilePicUrl: targetUser.profile_pic_url || DEFAULT_PROFILE_PIC,
                profilePicUrl: targetUser.profile_pic_url,
                friendCount: friendCount
            },
            posts: posts,
            isOwnProfile: isOwnProfile,
            title: `${targetUser.username}'s Profile`
        });

    } catch (error) {
        console.error('Profile view error:', error.message);
        res.status(500).send('Error loading profile.');
    }
});

// // Port listener
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });

// Port listener
const PORT = process.env.PORT || 3000;
// Assign the result of app.listen() (the HTTP server object) to a variable.
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// EXPORT THE SERVER INSTANCE
module.exports = server;
