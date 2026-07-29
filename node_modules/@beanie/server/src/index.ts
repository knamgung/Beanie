// Beanie game server bootstrap.

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { BeanieRoom } from "./rooms/BeanieRoom.js";

const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server({
  transport: new WebSocketTransport(),
});

gameServer.define("beanie", BeanieRoom);

gameServer.listen(port).then(() => {
  console.log(`🫘 Beanie server listening on ws://localhost:${port}`);
});
