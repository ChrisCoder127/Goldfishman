
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ==================================
// GAME CONFIGURATION
// ==================================

const WORLD_SIZE = 4000;
const FOOD_COUNT = 350;
const TICK_RATE = 30;

const STARTING_RADIUS = 18;
const FOOD_GROWTH = 0.8;
const EAT_MULTIPLIER = 1.15;
const MAX_RADIUS = 500;

const COLORS = [
    "#f28b36",
    "#ff668d",
    "#36bfa6",
    "#63a9d5",
    "#b28cff",
    "#e9bd48",
    "#ed7650"
];

// ==================================
// GAME DATA
// ==================================

const players = {};
let foods = [];
let nextFoodId = 0;

// ==================================
// HELPER FUNCTIONS
// ==================================

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// ==================================
// FOOD SYSTEM
// ==================================

function createFood() {
    return {
        id: nextFoodId++,
        x: random(20, WORLD_SIZE - 20),
        y: random(20, WORLD_SIZE - 20),
        radius: random(4, 7),
        color: "#f2a93b"
    };
}

function spawnFood() {
    while (foods.length < FOOD_COUNT) {
        foods.push(createFood());
    }
}

spawnFood();

// ==================================
// PLAYER SYSTEM
// ==================================

function createPlayer(id, name) {
    return {
        id,
        name,
        x: random(200, WORLD_SIZE - 200),
        y: random(200, WORLD_SIZE - 200),

        targetX: WORLD_SIZE / 2,
        targetY: WORLD_SIZE / 2,

        radius: STARTING_RADIUS,
        color: randomColor()
    };
}

// ==================================
// CONNECTIONS
// ==================================

io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    let lastMove = 0;

    // PLAYER JOINS
    socket.on("joinGame", (rawName) => {
        if (players[socket.id]) return;

        if (typeof rawName !== "string") {
            socket.emit("joinError", "Invalid username.");
            return;
        }

        const name = rawName
            .replace(/[<>]/g, "")
            .replace(/[\u0000-\u001F\u007F]/g, "")
            .trim()
            .slice(0, 16);

        if (!name) {
            socket.emit("joinError", "Enter a username.");
            return;
        }

        players[socket.id] = createPlayer(socket.id, name);

        console.log(name + " joined the arena.");

        broadcastGameState();
    });

    // PLAYER MOVEMENT
    socket.on("move", (data) => {
        const player = players[socket.id];

        if (!player || !data) return;

        // Limit movement messages.
        const now = Date.now();

        if (now - lastMove < 25) return;

        lastMove = now;

        const x = Number(data.x);
        const y = Number(data.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        player.targetX = clamp(x, 0, WORLD_SIZE);
        player.targetY = clamp(y, 0, WORLD_SIZE);
    });

    // PLAYER LEAVES
    socket.on("disconnect", () => {
        const player = players[socket.id];

        if (player) {
            console.log(player.name + " left the arena.");

            delete players[socket.id];

            broadcastGameState();
        }
    });
});

// ==================================
// MOVEMENT
// ==================================

function updateMovement() {
    for (const player of Object.values(players)) {
        const dx = player.targetX - player.x;
        const dy = player.targetY - player.y;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) continue;

        const speed = Math.max(
            1.5,
            5 - player.radius * 0.025
        );

        const amount = Math.min(speed, dist);

        player.x += (dx / dist) * amount;
        player.y += (dy / dist) * amount;

        player.x = clamp(
            player.x,
            player.radius,
            WORLD_SIZE - player.radius
        );

        player.y = clamp(
            player.y,
            player.radius,
            WORLD_SIZE - player.radius
        );
    }
}

// ==================================
// FOOD COLLISIONS
// ==================================

function updateFood() {
    for (const player of Object.values(players)) {
        for (let i = foods.length - 1; i >= 0; i--) {
            const food = foods[i];

            if (
                distance(player, food) <
                player.radius + food.radius
            ) {
                player.radius = Math.min(
                    MAX_RADIUS,
                    player.radius + FOOD_GROWTH
                );

                foods.splice(i, 1);
            }
        }
    }

    spawnFood();
}

// ==================================
// PLAYER EATING
// ==================================

function updatePlayerEating() {
    const list = Object.values(players);
    const dead = new Set();

    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];

            if (dead.has(a.id) || dead.has(b.id)) {
                continue;
            }

            const dist = distance(a, b);

            if (
                a.radius > b.radius * EAT_MULTIPLIER &&
                dist < a.radius * 0.75
            ) {
                a.radius = Math.min(
                    MAX_RADIUS,
                    a.radius + b.radius * 0.25
                );

                dead.add(b.id);
            } else if (
                b.radius > a.radius * EAT_MULTIPLIER &&
                dist < b.radius * 0.75
            ) {
                b.radius = Math.min(
                    MAX_RADIUS,
                    b.radius + a.radius * 0.25
                );

                dead.add(a.id);
            }
        }
    }

    for (const id of dead) {
        const playerSocket = io.sockets.sockets.get(id);

        delete players[id];

        if (playerSocket) {
            playerSocket.emit("playerDied");
        }
    }
}

// ==================================
// GAME STATE
// ==================================

function broadcastGameState() {
    io.emit("gameState", {
        players,
        foods
    });
}

// ==================================
// GAME LOOP
// ==================================

function gameUpdate() {
    updateMovement();
    updateFood();
    updatePlayerEating();

    broadcastGameState();
}

setInterval(gameUpdate, 1000 / TICK_RATE);

// ==================================
// WEBSITE FILES
// ==================================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get("/style.css", (req, res) => {
    res.sendFile(__dirname + "/style.css");
});

app.get("/game.js", (req, res) => {
    res.sendFile(__dirname + "/game.js");
});

// ==================================
// START SERVER
// ==================================

server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("================================");
    console.log("       GOLDFISHMAN SERVER");
    console.log("================================");
    console.log("Status: ONLINE");
    console.log("Port: " + PORT);
    console.log("World: " + WORLD_SIZE + " x " + WORLD_SIZE);
    console.log("Food: " + FOOD_COUNT);
    console.log("Tick rate: " + TICK_RATE);
    console.log("================================");
    console.log("");
});
