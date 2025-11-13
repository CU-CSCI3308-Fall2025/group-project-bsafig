# Spotigang Music Social Feed

## Application Description

## Contributers
- Ben Safigan
- Cara Wang
- George Fisher
- James Nguyen
- Mason Chansamone

## Technology Stack

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


Docker compose up in the ProjectSourceCode folder.  
It should show up at localhost:3000.  

## How to run tests
In the docker-compose.yaml file, make sure you change npm start to npm run testandrun (it is also written in comment).  
Then, docker compose up.  

## Deployed Application
Here's the link to the deployed application:
