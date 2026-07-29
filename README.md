# 🫘 Beanie

A turn-based card game for 2–4 friends. Gin-rummy-flavoured, with a rotating
wild "Beanie" rank, 14 rounds, and a lowest-total-score-wins finish.

## Stack

| Part | Tech |
| --- | --- |
| `shared/` | Pure TypeScript rules engine (no framework) — cards, beanies, hand validation, insert/reclaim, scoring. **42 unit tests.** |
| `server/` | [Colyseus](https://colyseus.io) authoritative game server (Node + WebSockets). Holds the real game state; runs every rule through `shared`. |
| `client/` | React + Vite. Renders synced state and sends player intents. |

npm workspaces tie the three together.

## Run it locally

Install once from the repo root:

```bash
npm install
```

Then start the two processes in **two terminals**:

```bash
# terminal 1 — game server (ws://localhost:2567)
npm run dev:server

# terminal 2 — web client (http://localhost:5173)
npm run dev:client
```

Open http://localhost:5173, enter a name, **Create table**, and share the room
code shown in the lobby. Friends open the same URL and **Join table** with the
code. (For friends on other machines, point `VITE_SERVER` at your server's
address, e.g. `VITE_SERVER=ws://192.168.1.20:2567 npm run dev:client`.)

## Test the rules engine

```bash
npm test
```

## How a turn works

1. **Draw** a card (from the draw pile or the top of the discard).
2. Optionally **play** hands (straight flush / 3–4 of a kind, beanies wild),
   **insert** cards into any played hand, or **reclaim** a beanie — any mix.
3. **Discard** to end your turn.

No one may go out during the first rotation. Emptying your hand in one turn with
a 7-card straight flush lets you **double everyone else's score or halve your own**.
Round 14 allows only that 7-card-straight-flush finish.
