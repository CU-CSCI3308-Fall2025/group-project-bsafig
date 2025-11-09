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

// Handlebars setup
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


// Route: /get-friends
// Returns all accepted friends + each friend's total friend count
app.get('/get-friends', async(req, res) => {
    const uid = req.session.user.user_id;

    const friends = await db.any(`
    SELECT u.user_id, u.username,
           (
             SELECT COUNT(*)
             FROM friendships f2
             WHERE (f2.user_id = u.user_id OR f2.friend_id = u.user_id)
               AND f2.status = 'accepted'
           ) AS friend_count
    FROM friendships f
    JOIN users u
      ON u.user_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
    WHERE (f.user_id = $1 OR f.friend_id = $1)
      AND f.status = 'accepted'
    ORDER BY u.username;
  `, [uid]);

    res.json(friends);
});

// Route: /unfriend
// Deletes an accepted friendship between the logged-in user and the given friend_id
app.post('/unfriend', async(req, res) => {
    // current user and the friend to remove
    const uid = req.session.user.user_id;
    const { friendId } = req.body;

    // Remove the friendship row regardless of direction
    await db.none(`
    DELETE FROM friendships
    WHERE status = 'accepted'
      AND (
        (user_id = $1 AND friend_id = $2) OR
        (user_id = $2 AND friend_id = $1)
      )
  `, [uid, friendId]);

    res.json({ ok: true });
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

// POST Delete Account Endpoint
app.post('/profile/settings/deleteAccount', async (req, res) => {
    const currentUserId = req.session.user.user_id;

    try {
        // Delete user and associated data (requires ON DELETE CASCADE in DB setup)
        await db.none('DELETE FROM users WHERE user_id = $1', [currentUserId]);

        // Destroy the session and redirect to login
        req.session.destroy(err => {
            if (err) {
                console.error('Logout error after account deletion:', err);
                // Even on error, redirect since the user is deleted
            }
            // Redirect to login with a message
            res.render('pages/login', { message: 'Your account has been successfully deleted.' });
        });

    } catch (error) {
        console.error('Account deletion error:', error.message);
        // If an error occurs before destroy, render the settings page with an error
        if (!res.headersSent) {
            return res.status(500).render('pages/settings', {
                user: req.session.user,
                message: 'An error occurred while deleting your account.'
            });
        }
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

// POST Create a new review post
app.get('/postbox', (req, res) => {
  res.render('pages/postbox', { user: req.session.user });
});

app.post('/post-review', async(req, res) => {
    const { music_name, rating, content } = req.body;
    const userId = req.session.user.user_id;
    if (!userId) return res.status(401).send('User not logged in.');

  try {
    await db.none(
      'INSERT INTO reviews(user_id, music_name, rating, content) VALUES($1, $2, $3, $4)',
      [userId, music_name, rating, content]
    );
    res.redirect('/home'); //can also redirect to profile page to show the review
  } catch (error) {
    console.error('Error posting review:', error.message);
    res.status(500).send('Error posting review: ' + error.message);
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
