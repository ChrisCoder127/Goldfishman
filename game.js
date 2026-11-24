
const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("menu");
const joinForm = document.getElementById("joinForm");
const usernameInput = document.getElementById("username");

const connectionText = document.getElementById("connection");
const connectionDot = document.getElementById("connectionDot");
const playerCount = document.getElementById("playerCount");
const leaderboard = document.getElementById("leaderboard");
const sizeText = document.getElementById("size");
const errorText = document.getElementById("error");

let players = {};
let foods = [];
let myId = null;
let playing = false;

let camera = {
    x: 0,
    y: 0,
    zoom: 1
};

let mouse = {
    x: 0,
    y: 0
};

const WORLD_SIZE = 4000;
const FOOD_COLOR = "#f2a93b";


// CANVAS RESIZING

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();


// CONNECTION STATUS

socket.on("connect", () => {
    connectionText.textContent = "CONNECTED";
    connectionDot.style.background = "#71d69b";
    myId = socket.id;
});

socket.on("disconnect", () => {
    connectionText.textContent = "DISCONNECTED";
    connectionDot.style.background = "#ff806b";
    errorText.textContent = "Connection lost. Reconnecting...";
});

socket.on("connect_error", () => {
    connectionText.textContent = "CONNECTION ERROR";
    connectionDot.style.background = "#ff806b";
});


// JOIN GAME

joinForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();

    if (!username) {
        errorText.textContent = "Enter a username first.";
        return;
    }

    if (username.length > 16) {
        errorText.textContent = "Username must be 16 characters or less.";
        return;
    }

    if (!socket.connected) {
        errorText.textContent = "Waiting for server connection...";
        return;
    }

    errorText.textContent = "";

    socket.emit("joinGame", username);

    playing = true;
    menu.style.display = "none";
});


// SERVER RESPONSES

socket.on("gameState", (state) => {
    players = state.players || {};
    foods = state.foods || [];

    if (state.players && myId && state.players[myId]) {
        const me = state.players[myId];

        sizeText.textContent = "SIZE: " + Math.round(me.radius);
    }

    updatePlayerCount();
    updateLeaderboard();
});

socket.on("joinError", (message) => {
    playing = false;
    menu.style.display = "grid";
    errorText.textContent = message || "Could not join the game.";
});

socket.on("playerDied", () => {
    playing = false;
    menu.style.display = "grid";
    errorText.textContent = "You were eaten! Try again.";
    sizeText.textContent = "SIZE: —";
});


// PLAYER COUNT

function updatePlayerCount() {
    const count = Object.keys(players).length;

    playerCount.textContent =
        count + (count === 1 ? " PLAYER" : " PLAYERS");
}


// LEADERBOARD

function updateLeaderboard() {
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.radius - a.radius)
        .slice(0, 5);

    leaderboard.innerHTML = "";

    if (sortedPlayers.length === 0) {
        const li = document.createElement("li");
        li.textContent = "Waiting for players...";
        leaderboard.appendChild(li);
        return;
    }

    sortedPlayers.forEach((player) => {
        const li = document.createElement("li");

        const name = document.createElement("span");
        name.textContent = player.name || "Unknown";

        const score = document.createElement("span");
        score.textContent = " — " + Math.round(player.radius);

        li.appendChild(name);
        li.appendChild(score);

        leaderboard.appendChild(li);
    });
}


// MOUSE CONTROLS

canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();

    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
});


// TOUCH CONTROLS

canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const touch = event.touches[0];

    mouse.x = touch.clientX - rect.left;
    mouse.y = touch.clientY - rect.top;

}, { passive: false });


// SEND MOVEMENT TO SERVER

setInterval(() => {
    if (!playing || !myId || !socket.connected) return;

    const me = players[myId];
    if (!me) return;

    const rect = canvas.getBoundingClientRect();

    const targetX = me.x + (mouse.x - rect.width / 2) / camera.zoom;
    const targetY = me.y + (mouse.y - rect.height / 2) / camera.zoom;

    socket.emit("move", {
        x: targetX,
        y: targetY
    });

}, 40);


// CAMERA

function updateCamera() {
    if (!myId || !players[myId]) return;

    const me = players[myId];

    const rect = canvas.getBoundingClientRect();

    const targetZoom = Math.max(0.55, 1.3 - me.radius / 250);

    camera.x += (me.x - camera.x) * 0.12;
    camera.y += (me.y - camera.y) * 0.12;
    camera.zoom += (targetZoom - camera.zoom) * 0.04;

    return rect;
}


// DRAW BACKGROUND

function drawBackground(width, height) {
    ctx.fillStyle = "#102d31";
    ctx.fillRect(0, 0, width, height);

    const spacing = 50;

    ctx.strokeStyle = "rgba(180, 220, 205, 0.07)";
    ctx.lineWidth = 1;

    const startX = -((camera.x * camera.zoom) % spacing);
    const startY = -((camera.y * camera.zoom) % spacing);

    for (let x = startX; x < width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    for (let y = startY; y < height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}


// DRAW WORLD BORDER

function drawWorldBorder() {
    ctx.strokeStyle = "#f2a93b";
    ctx.lineWidth = 5;

    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
}


// DRAW FOOD

function drawFood() {
    foods.forEach((food) => {
        ctx.beginPath();
        ctx.arc(food.x, food.y, food.radius || 5, 0, Math.PI * 2);

        ctx.fillStyle = FOOD_COLOR;
        ctx.fill();
    });
}


// DRAW FISH

function drawFish(player) {
    const radius = player.radius || 15;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Direction toward mouse for your fish
    let angle = 0;

    if (player.id === myId) {
        angle = Math.atan2(
            mouse.y - canvas.clientHeight / 2,
            mouse.x - canvas.clientWidth / 2
        );
    }

    ctx.rotate(angle);

    // Fish body
    ctx.beginPath();
    ctx.ellipse(
        0,
        0,
        radius,
        radius * 0.75,
        0,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = player.color || "#f2a93b";
    ctx.fill();

    // Tail
    ctx.beginPath();
    ctx.moveTo(-radius * 0.7, 0);
    ctx.lineTo(-radius * 1.5, -radius * 0.55);
    ctx.lineTo(-radius * 1.5, radius * 0.55);
    ctx.closePath();

    ctx.fillStyle = player.color || "#f2a93b";
    ctx.fill();

    // Eye
    ctx.beginPath();
    ctx.arc(radius * 0.45, -radius * 0.2, Math.max(2, radius * 0.09), 0, Math.PI * 2);
    ctx.fillStyle = "#10251f";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(radius * 0.48, -radius * 0.23, Math.max(1, radius * 0.035), 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.restore();

    // Username
    ctx.fillStyle = "#f2f0e7";
    ctx.font = "12px Manrope, sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
        player.name || "Fish",
        player.x,
        player.y - radius - 12
    );
}


// MAIN GAME LOOP

function gameLoop() {
    requestAnimationFrame(gameLoop);

    const rect = canvas.getBoundingClientRect();

    const width = rect.width;
    const height = rect.height;

    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    drawBackground(width, height);

    if (myId && players[myId]) {
        updateCamera();

        ctx.save();

        ctx.translate(width / 2, height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        drawWorldBorder();
        drawFood();

        Object.entries(players).forEach(([id, player]) => {
            drawFish({
                ...player,
                id
            });
        });

        ctx.restore();
    }
}

gameLoop();
