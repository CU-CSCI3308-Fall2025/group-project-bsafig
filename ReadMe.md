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

## Directory Structure
- The `MilestoneSubmissions` folder contains all the necessary meeting notes, release notes, and writeups for turnins for various labs during the group project.
- The `ProjectSourceCode` folder contains all necessary code required to run the application. It is split up into several core portions:
    - In the root of `ProjectSourceCode`, there is a `docker-compose.yaml` necessary to run the application. The root also contains the `index.js`, containing all of the necessary JavaScript endpoints for the application.
    - The `init_data` directory defines all of the necessary PostgreSQL tables for the application inside `create.sql`. 
    - The `public` directory contains helper functions and images, such as the default profile picture of a user and the Spotify Search capability.
    - The `test` directory contains the JavaScript to run unit tests with Mocha and Chai, usable by modifying the `docker-compose.yaml` file.
    - The `views` directory contains all of the Handlebars used to dynamically render the Spotigang website, including core `pages` and necessary `partials`. 

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
