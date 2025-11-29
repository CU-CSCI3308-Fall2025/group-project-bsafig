# Spotigang Music Social Feed

## Application Description
A music social feed application using the Spotify API to search for existing songs.

## Contributers
- Ben Safigan
- Cara Wang
- George Fisher
- James Nguyen
- Mason Chansamone

## Technology Stack
- Node.js
- Express
- Docker
- Axios (Spotify API)
- Handlebars
- PostgreSQL

## Prerequisites
- Docker Desktop (Mac/Windows) >v28 / Docker Engine (Linux)
- The following will be automatically pulled by the Docker setup when running locally:
    - Node.js (v24.11.1 or LTS)
    - PostgreSQL Database Server v14

## How to run application locally
- git clone the repository
- cd ./ProjectSourceCode
- Add the following .env file to the /ProjectSourceCode directory:
```
    # database credentials
    POSTGRES_USER="postgres"
    POSTGRES_PASSWORD="pwd"
    POSTGRES_DB="users_db"
    # API vars
    SESSION_SECRET="super duper secret!"
    SPOTIFY_CLIENT_ID=YOUR SPOTIFY ID HERE
    SPOTIFY_CLIENT_SECRET=YOUR SPOTIFY SECRET HERE
```


In the /ProjectSourceCode directory, run:
```
    docker compose up
```
The application should show up at localhost:3000.  

## How to run tests
In the docker-compose.yaml file, make sure you change npm start to npm run testandrun (it is also written in a comment).  
Then, run:
```
    docker compose up
```

## Deployed Application
The deployed application can be found at https://spotigang.onrender.com/
