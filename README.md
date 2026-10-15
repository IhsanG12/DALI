# Tether

Helping families separated by a hurricane evacuation find each other, built for shelter volunteers working with weak or no internet.

> Work in progress. Full README (overview, the full picture, design, technical choices) coming soon.

## Try a match in 2 minutes

1. Open the app and set up the device with join code **DEMO-NORTH**.
2. Open the app again in a **private/incognito window** (it acts as a second device) and use **DEMO-SOUTH**.
3. In North, add *Maria Garcia, 34*, looking for *Leo Garcia, son, 7*. Tick **Keep hidden** if you like.
4. In South, add *Leo Garcia, 7*, looking for *Maria, mother*.
5. In South, open **Matches**: a volunteer is asked to check with Leo. Tap **Yes, connect**.
6. In North, open **Outbox → Send now**, then **Matches**: both shelters now see each other's shelter id, and nothing else.

The free server sleeps when idle, so the first request can take up to a minute.

## Safety rules the code enforces

- **No fake shelters.** Devices can only be set up with a join code a coordinator created. Everything else is rejected.
- **No locations, ever.** Where someone is in a shelter never leaves the device. Matches never say where the other person is.
- **Shelter ids only after a yes.** Each side learns the other shelter's id only after the person who was found agrees. A "no" looks exactly like "still waiting" to the searcher.
- **Hidden people can't be found.** Their name, age and neighborhood are never sent; only who they're looking for.

## Creating a real shelter (coordinators)

Set `ADMIN_KEY` on the server, then:

```bash
curl -X POST https://<server>/api/admin/shelters \
  -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Lincoln High School Gym"}'
# -> { "id": "S-7Q4K", "name": "...", "joinCode": "LP4C-JY87" }   (the join code is shown once)
```

## Running locally

```bash
# backend
cd server
cp .env.example .env   # then paste your database URL into .env
npm install
npm run dev            # http://localhost:3001

# frontend (in a second terminal)
cd client
npm install
npm run dev            # http://localhost:5173
```
