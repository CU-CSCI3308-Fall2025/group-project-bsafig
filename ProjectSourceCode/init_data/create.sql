-- Usecase guidelines --
/*
    All 'NOT NULL' fields must be filled during inserts
    Unique fields must not duplicate existing entries
    Foreign key references must point to existing records
    Do not include specific values for any serial keys, they auto-increment
    Do not include specific values for any timestamp fields, they default to the current timestamp
    Profile picure url is NULL by default
*/

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    profile_picture_url VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    review_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friendships (
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    friend_id INTEGER NOT NULL REFERENCES users(user_id),
    status VARCHAR(20) NOT NULL IN ('pending', 'accepted'),
    PRIMARY KEY (user_id, friend_id)
);

-- COMMENTS TABLE TBA --
/*
CREATE TABLE IF NOT EXISTS comments (
    comment_id SERIAL PRIMARY KEY,
    review_id INTEGER NOT NULL REFERENCES reviews(review_id),
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
*/