
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// GAME SETTINGS

const WORLD_SIZE = 4000;
const STARTING_SIZE = 18;
const FOOD_COUNT = 350;
const TICK_RATE = 30;

const PLAYER_SPEED = 5;
const FOOD_GROWTH = 0.8;
const PLAYER_EAT_MULTIPLIER = 1.15;

const COLORS = [
    "#f2a93b",
    "#e87942",
    "#e7c65a",
    "#72b9a0",
    "#81a9d8",
    "#d98ba5",
    "#b5a1df"
];

// GAME DATA

const players = {};
let foods = [];
let nextFoodId = 0;


// RANDOM HELPERS

function randomNumber(min, max) {
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


// FOOD SYSTEM

function createFood() {
    return {
        id: nextFoodId++,
        x: randomNumber(30, WORLD_SIZE - 30),
        y: randomNumber(30, WORLD_SIZE - 30),
        radius: randomNumber(4, 7),
        color: "#f2a93b"
    };
}

function initializeFood() {
    foods = [];

    for (let i = 0; i < FOOD_COUNT; i++) {
        foods.push(createFood());
    }
}

initializeFood();


// PLAYER SYSTEM

function createPlayer(socket, name) {
    return {
        id: socket.id,
        name: name,
        x: randomNumber(200, WORLD_SIZE - 200),
        y: randomNumber(200, WORLD_SIZE - 200),
        targetX: WORLD_SIZE / 2,
        targetY: WORLD_SIZE / 2,
        radius: STARTING_SIZE,
        color: randomColor()
    };
}


// JOIN GAME

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    socket.on("joinGame", (rawName) => {
        if (typeof rawName !== "string") {
            socket.emit("joinError", "Invalid username.");
            return;
        }

        const name = rawName.trim().slice(0, 16);

        if (!name) {
            socket.emit("joinError", "Enter a username.");
            return;
        }

        // Don't create duplicate player objects.
        if (players[socket.id]) {
            players[socket.id].name = name;
            return;
        }

        players[socket.id] = createPlayer(socket, name);

        console.log(name, "joined the arena.");

        broadcastGameState();
    });


    // PLAYER MOVEMENT

    socket.on("move", (data) => {
        const player = players[socket.id];

        if (!player || !data) return;

        const x = Number(data.x);
        const y = Number(data.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        player.targetX = Math.max(
            0,
            Math.min(WORLD_SIZE, x)
        );

        player.targetY = Math.max(
            0,
            Math.min(WORLD_SIZE, y)
        );
    });


    // DISCONNECT

    socket.on("disconnect", () => {
        if (players[socket.id]) {
            console.log(players[socket.id].name, "left the arena.");
            delete players[socket.id];
            broadcastGameState();
        }
    });
});


// MOVE PLAYERS

function updatePlayerMovement() {
    Object.values(players).forEach((player) => {
        const dx = player.targetX - player.x;
        const dy = player.targetY - player.y;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) return;

        // Larger fish move slightly slower.
        const speed = Math.max(
            1.5,
            PLAYER_SPEED - player.radius * 0.025
        );

        const movement = Math.min(speed, dist);

        player.x += (dx / dist) * movement;
        player.y += (dy / dist) * movement;

        player.x = Math.max(
            player.radius,
            Math.min(WORLD_SIZE - player.radius, player.x)
        );

        player.y = Math.max(
            player.radius,
            Math.min(WORLD_SIZE - player.radius, player.y)
        );
    });
}


// FOOD COLLISIONS

function updateFoodCollisions() {
    Object.values(players).forEach((player) => {
        for (let i = foods.length - 1; i >= 0; i--) {
            const food = foods[i];

            const dist = distance(player, food);

            if (dist < player.radius + food.radius) {
                player.radius += FOOD_GROWTH;

                foods.splice(i, 1);
                foods.push(createFood());
            }
        }
    });
}


// PLAYER COLLISIONS

function updatePlayerCollisions() {
    const playerList = Object.values(players);
    const deadPlayers = [];

    for (let i = 0; i < playerList.length; i++) {
        for (let j = i + 1; j < playerList.length; j++) {
            const a = playerList[i];
            const b = playerList[j];

            if (deadPlayers.includes(a.id) || deadPlayers.includes(b.id)) {
                continue;
            }

            const dist = distance(a, b);

            // A player must be noticeably larger to eat another.
            if (
                a.radius > b.radius * PLAYER_EAT_MULTIPLIER &&
                dist < a.radius * 0.75
            ) {
                a.radius += b.radius * 0.25;
                deadPlayers.push(b.id);
            } else if (
                b.radius > a.radius * PLAYER_EAT_MULTIPLIER &&
                dist < b.radius * 0.75
            ) {
                b.radius += a.radius * 0.25;
                deadPlayers.push(a.id);
            }
        }
    }

    // Remove eaten players and notify them.
    deadPlayers.forEach((id) => {
        const socket = io.sockets.sockets.get(id);

        delete players[id];

        if (socket) {
            socket.emit("playerDied");
        }
    });
}


// BROADCAST GAME STATE

function broadcastGameState() {
    io.emit("gameState", {
        players,
        foods
    });
}


// MAIN GAME UPDATE

function gameUpdate() {
    updatePlayerMovement();
    updateFoodCollisions();
    updatePlayerCollisions();

    broadcastGameState();
}


// RUN GAME LOOP

setInterval(gameUpdate, 1000 / TICK_RATE);


// BASIC WEBSITE ROUTE

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});


// START SERVER

server.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log(" GOLDFISHMAN.COM SERVER STARTED");
    console.log("--------------------------------");
    console.log("Port:", PORT);
    console.log("World:", WORLD_SIZE, "x", WORLD_SIZE);
});
