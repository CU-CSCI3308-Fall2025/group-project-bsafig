# Spotigang Music Social Feed

## Application Description
A music social feed application.

## Contributers
- Ben Safigan
- Cara Wang
- George Fisher
- James Nguyen
- Mason Chansamone

## Technology Stack
Node.js, Docker, Spotify API, Handlebars, PostgreSQL

## How to run application locally
Add the following .env file to the ProjectSourceCode folder:
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


In the ProjectSourceCode directory, run:
```
    docker compose up
```
It should show up at localhost:3000.  

## How to run tests
In the docker-compose.yaml file, make sure you change npm start to npm run testandrun (it is also written in a comment).  
Then, run:
```
    docker compose up
```

## Deployed Application
Here's the link to the deployed application:
