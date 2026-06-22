# mini-project-microservices

Architecture for SocioGuard with 4 services:

- `ms-content`: Content service that publishes `content.submitted` and tracks post state.
- `ms-moderation`: Moderation service that consumes submitted content, applies rules, and publishes `content.approved` or `content.flagged`.
- `ms-reputation`: Reputation service that consumes moderation outcomes and blocks users when score reaches 0.
- `ms-gateway`: HTTP gateway exposing the microservices through REST endpoints.

## Local setup

1. Start Kafka locally and make sure `localhost:9092` is reachable.
2. Install dependencies per service:
   - `cd ms-content && npm install`
   - `cd ms-moderation && npm install`
   - `cd ms-reputation && npm install`
   - `cd ms-gateway && npm install`
3. Start each service in separate terminals:
   - `cd ms-content && npm start`
   - `cd ms-moderation && npm start`
   - `cd ms-reputation && npm start`
   - `cd ms-gateway && npm start`

## API endpoints

- `POST /users` → create a user
- `GET /users` → list users
- `GET /users/:userId` → get user details
- `POST /posts` → create a new post
- `GET /posts` → list posts, optional `?status=PENDING|APPROUVE|REJETE`
- `GET /posts/:id` → get a single post
- `GET /posts/:id/moderation` → get moderation report for a post
- `GET /users/:userId/can-post` → check whether user can post

## Notes

- Each microservice owns its own SQLite database.
- Kafka topics coordinate the message flow between services.
- `ms-gateway` talks to the services over gRPC.
