const express = require('express');
const bodyParser = require('body-parser');
const pgp = require('pg-promise')();
const bcrypt = require('bcryptjs');
const axios = require('axios');
const session = require('express-session');
const exphbs = require('express-handlebars');
require('dotenv').config();

let spotifyToken = null;
let tokenExpiresAt = null;

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < tokenExpiresAt) {
        return spotifyToken;
    }

    const response = await axios.post('https://accounts.spotify.com/api/token',
        new URLSearchParams({ grant_type: 'client_credentials' }), {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(
                    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
                ).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    spotifyToken = response.data.access_token;
    tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
    return spotifyToken;
}

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
    res.render('pages/login', { message: null, layout: false });
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
    res.render('pages/register', {layout: false});
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
app.get('/home', async(req, res) => {
    const currentUser = req.session.user;

    try {
        // Fetch all reviews with user info
        const reviews = await db.any(`
            SELECT r.review_id, r.music_name, r.rating, r.content, r.created_at,
                   u.username, COALESCE(u.profile_picture_url, $1) AS profile_picture_url
            FROM reviews r
            JOIN users u ON r.user_id = u.user_id
            ORDER BY r.created_at DESC
        `, [DEFAULT_PROFILE_PIC]);

        res.render('pages/home', {
            user: currentUser,
            reviews
        });
    } catch (error) {
        console.error('Error loading home page:', error.message);
        res.status(500).send('Server error loading posts.');
    }
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
             AND user_id NOT IN (
                 SELECT friend_id FROM friendships WHERE user_id = $2
                 UNION
                 SELECT user_id FROM friendships WHERE friend_id = $2
             )
             LIMIT 10`, [`${query}%`, currentUserId]
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
    SELECT u.user_id, u.username, cs.song_name, cs.note,
           (
             SELECT COUNT(*)
             FROM friendships f2
             WHERE (f2.user_id = u.user_id OR f2.friend_id = u.user_id)
               AND f2.status = 'accepted'
           ) AS friend_count
    FROM friendships f
    JOIN users u
      ON u.user_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
    LEFT JOIN current_statuses cs ON u.user_id = cs.user_id
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
app.post('/profile/settings/updateUsername', async(req, res) => {
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
app.post('/profile/settings/updatePassword', async(req, res) => {
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

        // destroy session and redirect to login to reauthenticate
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
app.post('/profile/settings/updatePicture', async(req, res) => {
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

// POST Delete Account Endpoint
app.post('/profile/settings/deleteAccount', async(req, res) => {
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
app.get('/profile/:username', async(req, res) => {
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

        // Fetch Current Status
        const currentStatus = await db.oneOrNone(
            `SELECT song_name, note
             FROM current_statuses
             WHERE user_id = $1`, [targetUser.user_id]
        );

        // Fetch friend count (count both directions)
        // test to see if commit user changes
        // test commit 0
        const friends = await db.one(
            `SELECT COUNT(*) AS friend_count 
                FROM friendships 
                WHERE status = 'accepted' AND 
                (user_id = $1 OR friend_id = $1)`, [targetUser.user_id]
        );
        // friendCount = friends.friend_count
        friendCount = Number(friends.friend_count);

        // Fetch posts 
        const posts = await db.any(
            `SELECT r.review_id, r.rating, r.content, r.created_at, r.music_name,
            COALESCE(u.profile_picture_url, $2) AS "profile_picture_url", u.username
                FROM reviews r
                JOIN users u ON u.user_id = r.user_id
                WHERE r.user_id = $1
                ORDER BY r.created_at DESC`, [targetUser.user_id, DEFAULT_PROFILE_PIC]
        );
        // Render the page
        res.render('pages/profile', {
            user: {
                id: targetUser.user_id,
                username: targetUser.username,
                profilePicUrl: targetUser.profile_picture_url || DEFAULT_PROFILE_PIC,
                // profilePicUrl: targetUser.profile_picture_url,
                friendCount: friendCount
            },
            status: currentStatus,
            posts: posts,
            isOwnProfile: isOwnProfile,
            title: `${targetUser.username}'s Profile`
        });


    } catch (error) {
        console.error('Profile view error:', error.message);
        res.status(500).send('Error loading profile.');
    }
});

/* STATUS CREATION ENDPOINTS */

// GET Create New Status Form
app.get('/profile/status/create', (req, res) => {
    res.render('pages/create-status', {
        user: req.session.user,
        message: null
    });
});

// POST Create New Status (Listening To + Optional Note)
app.post('/profile/status', async(req, res) => {

    // TO DO: songName is currently a temporary variable from the form in create-status.hbs
    // if external API integration is successful, then this will allow a user to search an existing song from external db
    // otherwise, just allow a user to put any song here, basically an empty text box (if external api is not successful)
    // the current logic is only DATA VALIDATION, NOT the business logic; 
    // an actual, verifiable song has not been implemented
    const { songName, note } = req.body;
    const userId = req.session.user.user_id;

    // Validation: a song must be chosen 
    if (!songName || songName.trim() === '') {
        return res.render('pages/create-status', {
            user: req.session.user,
            message: 'A song is required to set your status.',
            error: true
        });
    }

    // if the note is empty or whitespace, set it to NULL for the database
    const statusNote = (note && note.trim() !== '') ? note.trim() : null;

    try {
        // A user can only have one status at a time, so:
        // Insert a new status; if the user_id already exists, then update the according conflicting fields. 
        await db.none(
            `INSERT INTO current_statuses(user_id, song_name, note) 
            VALUES($1, $2, $3)
            ON CONFLICT (user_id) DO UPDATE SET 
                song_name = EXCLUDED.song_name, 
                note = EXCLUDED.note, 
                updated_at = CURRENT_TIMESTAMP`, // Update timestamp on conflict
            [userId, songName.trim(), statusNote]
        );

        console.log(`User ${userId} successfully set status: Listening to "${songName}"`);

        res.redirect(`/profile/${req.session.user.username}`);

    } catch (error) {
        console.error('Error setting status:', error.message);
        return res.status(500).render('pages/create-status', {
            user: req.session.user,
            message: 'An unexpected error occurred while setting your status.',
            error: true
        });
    }
});

/* REVIEW ENDPOINTS */

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
            'INSERT INTO reviews(user_id, music_name, rating, content) VALUES($1, $2, $3, $4)', [userId, music_name, rating, content]
        );
        res.redirect('/home'); //can also redirect to profile page to show the review
    } catch (error) {
        console.error('Error posting review:', error.message);
        res.status(500).send('Error posting review: ' + error.message);
    }
});

// Spotify Search API Endpoint
app.get('/spotify-search', async(req, res) => {
    const { q, type = 'track,artist,album', offset = 0 } = req.query;
    if (!q) return res.status(400).send('Missing query');

    try {
        const token = await getSpotifyToken();
        const response = await axios.get('https://api.spotify.com/v1/search', {
            headers: { Authorization: `Bearer ${token}` },
            params: { q, type, limit: 10, offset: parseInt(offset) }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Spotify search failed:', error.message);
        res.status(500).send('Spotify API error');
    }
});

app.post('/editPost', async(req, res) => {
    const { review_id, rating, content } = req.body;
    const user_id = req.session.user.user_id;
    const username = req.session.user.username
    try {
        await db.none(
            `UPDATE reviews
            SET rating = $1,
                content = $2,
                created_at = CURRENT_TIMESTAMP
            WHERE review_id = $3 AND
            user_id = $4`, [rating, content, review_id, user_id]
        );
        res.redirect(`/profile/${username}`);

    } catch (error) {
        console.error('Error Editing Review:', error.message);
        res.status(500).send('Could not edit review');
    }
});

app.post('/deletePost', async(req, res) => {
    const { review_id } = req.body;
    const user_id = req.session.user.user_id;
    const username = req.session.user.username
    try {
        await db.none(
            `DELETE FROM reviews
            WHERE review_id = $1 AND
            user_id = $2`, [review_id, user_id]
        );
        res.redirect(`/profile/${username}`);

    } catch (error) {
        console.error(error);
        res.status(500).send('Could not delete post');
    }
});

/* COMMENT ENDPOINTS */

// GET comments for a specific review
app.get('/get-comments/:reviewId', async(req, res) => {
    const { reviewId } = req.params;

    try {
        const comments = await db.any(`
      SELECT c.comment_id, c.content, c.created_at,
             u.username, COALESCE(u.profile_picture_url, $1) AS profile_picture_url
      FROM comments c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.review_id = $2
      ORDER BY c.created_at ASC
    `, [DEFAULT_PROFILE_PIC, reviewId]);

        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error.message);
        res.status(500).json({ error: 'Failed to load comments.' });
    }
});

// POST a new comment
app.post('/add-comment', async(req, res) => {
    const { review_id, content } = req.body;
    const user_id = req.session.user.user_id;

    if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Comment cannot be empty.' });
    }

    try {
        await db.none(
            `INSERT INTO comments (review_id, user_id, content)
       VALUES ($1, $2, $3)`, [review_id, user_id, content.trim()]
        );

        res.json({ success: true, message: 'Comment added successfully!' });
    } catch (error) {
        console.error('Error adding comment:', error.message);
        res.status(500).json({ error: 'Failed to add comment.' });
    }
});

// POST react to review
app.post('/react-review', async(req, res) => {
    const { review_id, type } = req.body;
    const user_id = req.session.user.user_id;
    if (!['like', 'dislike'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    try {
        const existing = await db.oneOrNone(
            `SELECT reaction_id,type FROM review_reactions WHERE review_id=$1 AND user_id=$2`, [review_id, user_id]
        );
        if (existing) {
            if (existing.type === type) {
                await db.none(`DELETE FROM review_reactions WHERE reaction_id=$1`, [existing.reaction_id]);
            } else {
                await db.none(`UPDATE review_reactions SET type=$1 WHERE reaction_id=$2`, [type, existing.reaction_id]);
            }
        } else {
            await db.none(`INSERT INTO review_reactions(review_id,user_id,type) VALUES($1,$2,$3)`, [review_id, user_id, type]);
        }
        res.json({ success: true });
    } catch (err) { console.error(err);
        res.status(500).json({ error: 'Failed to react' }) }
});

// GET review reaction counts
app.get('/get-review-reactions/:reviewId', async(req, res) => {
    const { reviewId } = req.params;
    try {
        const counts = await db.one(`
      SELECT COUNT(*) FILTER (WHERE type='like') AS likes,
             COUNT(*) FILTER (WHERE type='dislike') AS dislikes
      FROM review_reactions
      WHERE review_id=$1`, [reviewId]);
        res.json(counts);
    } catch (err) { console.error(err);
        res.status(500).json({ likes: 0, dislikes: 0 }); }
});

// POST react to comment
app.post('/react-comment', async(req, res) => {
    const { comment_id, type } = req.body;
    const user_id = req.session.user.user_id;
    if (!['like', 'dislike'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

    try {
        const existing = await db.oneOrNone(
            `SELECT reaction_id,type FROM comment_reactions WHERE comment_id=$1 AND user_id=$2`, [comment_id, user_id]
        );
        if (existing) {
            if (existing.type === type) {
                await db.none(`DELETE FROM comment_reactions WHERE reaction_id=$1`, [existing.reaction_id]);
            } else {
                await db.none(`UPDATE comment_reactions SET type=$1 WHERE reaction_id=$2`, [type, existing.reaction_id]);
            }
        } else {
            await db.none(`INSERT INTO comment_reactions(comment_id,user_id,type) VALUES($1,$2,$3)`, [comment_id, user_id, type]);
        }
        res.json({ success: true });
    } catch (err) { console.error(err);
        res.status(500).json({ error: 'Failed to react' }) }
});

// GET comment reaction counts
app.get('/get-comment-reactions/:commentId', async(req, res) => {
    const { commentId } = req.params;
    try {
        const counts = await db.one(`
      SELECT COUNT(*) FILTER (WHERE type='like') AS likes,
             COUNT(*) FILTER (WHERE type='dislike') AS dislikes
      FROM comment_reactions
      WHERE comment_id=$1`, [commentId]);
        res.json(counts);
    } catch (err) { console.error(err);
        res.status(500).json({ likes: 0, dislikes: 0 }); }
});

// Port listener
const PORT = process.env.PORT || 3000;
// Assign the result of app.listen() (the HTTP server object) to a variable.
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// EXPORT THE SERVER INSTANCE
module.exports = server;