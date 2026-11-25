
"use strict";

// ========================================
// GOLDFISHMAN - OFFLINE TEST GAME
// No libraries or external packages needed.
// ========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const mainMenu = document.getElementById("mainMenu");
const gameScreen = document.getElementById("gameScreen");
const joinForm = document.getElementById("joinForm");
const usernameInput = document.getElementById("username");
const errorText = document.getElementById("error");
const offlineHint = document.getElementById("offlineHint");
const connection = document.getElementById("connection");
const connectionDot = document.getElementById("connectionDot");
const scoreText = document.getElementById("score");
const exitButton = document.getElementById("exitGame");

const WORLD = 3000;
const FOOD_AMOUNT = 400;
const BOT_AMOUNT = 12;

let offlineMode = false;
let playing = false;
let animationFrame = null;

let foods = [];
let bots = [];

let player = null;

let camera = {
    x: 0,
    y: 0
};

let mouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
};

const keys = {};

const colors = [
    "#f28b36",
    "#36bfa6",
    "#63a9d5",
    "#e9a5b2",
    "#b28cff",
    "#e9bd48",
    "#ed7650",
    "#4bc5c5"
];

// ========================================
// CANVAS SIZE
// ========================================

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ========================================
// HELPERS
// ========================================

function random(min, max) {
    return Math.random() * (max - min) + min;
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomColor() {
    return colors[Math.floor(Math.random() * colors.length)];
}

// ========================================
// OFFLINE MODE SHORTCUT
// CTRL + ALT + I
// ========================================

document.addEventListener("keydown", (event) => {
    if (
        event.ctrlKey &&
        event.altKey &&
        event.key.toLowerCase() === "i"
    ) {
        event.preventDefault();
        toggleOfflineMode();
    }
});

function toggleOfflineMode() {
    offlineMode = !offlineMode;

    if (offlineMode) {
        connection.textContent = "OFFLINE TEST MODE";
        connectionDot.style.background = "#36bfa6";
        offlineHint.textContent = "OFFLINE MODE ENABLED — READY TO TEST";
        offlineHint.style.color = "#279c84";

        errorText.textContent = "";
    } else {
        connection.textContent = "OFFLINE";
        connectionDot.style.background = "#d6a64b";
        offlineHint.textContent =
            "PRESS CTRL + ALT + I TO ENABLE OFFLINE TEST MODE";

        if (playing) {
            stopGame();
        }
    }
}

// ========================================
// FOOD
// ========================================

function createFood() {
    return {
        x: random(30, WORLD - 30),
        y: random(30, WORLD - 30),
        radius: random(4, 7),
        color: randomColor()
    };
}

function createFoods() {
    foods = [];

    for (let i = 0; i < FOOD_AMOUNT; i++) {
        foods.push(createFood());
    }
}

// ========================================
// PLAYER
// ========================================

function createPlayer(name) {
    return {
        name: name,
        x: WORLD / 2,
        y: WORLD / 2,
        radius: 18,
        color: "#ff9c32",
        speed: 4.2
    };
}

// ========================================
// BOTS
// ========================================

function createBot(index) {
    return {
        name: "Bot " + (index + 1),
        x: random(100, WORLD - 100),
        y: random(100, WORLD - 100),
        radius: random(16, 36),
        color: randomColor(),
        targetX: random(0, WORLD),
        targetY: random(0, WORLD),
        thinkTime: random(30, 100),
        personality: Math.random(),
        speed: random(1.5, 2.7)
    };
}

function createBots() {
    bots = [];

    for (let i = 0; i < BOT_AMOUNT; i++) {
        bots.push(createBot(i));
    }
}

// ========================================
// START / EXIT
// ========================================

joinForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!offlineMode) {
        errorText.textContent =
            "Enable Offline Test Mode first: CTRL + ALT + I";
        return;
    }

    const name = usernameInput.value.trim().slice(0, 16);

    if (!name) {
        errorText.textContent = "Enter a player name.";
        return;
    }

    startGame(name);
});

function startGame(name) {
    player = createPlayer(name);

    createFoods();
    createBots();

    playing = true;

    mainMenu.style.display = "none";
    gameScreen.style.display = "block";

    camera.x = player.x;
    camera.y = player.y;

    errorText.textContent = "";

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }

    gameLoop();
}

function stopGame() {
    playing = false;

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    gameScreen.style.display = "none";
    mainMenu.style.display = "flex";
}

exitButton.addEventListener("click", stopGame);

// ========================================
// MOVEMENT INPUT
// ========================================

window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
});

window.addEventListener("keydown", (event) => {
    keys[event.key.toLowerCase()] = true;
});

window.addEventListener("keyup", (event) => {
    keys[event.key.toLowerCase()] = false;
});

function updatePlayer() {
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["arrowup"]) dy -= 1;
    if (keys["s"] || keys["arrowdown"]) dy += 1;
    if (keys["a"] || keys["arrowleft"]) dx -= 1;
    if (keys["d"] || keys["arrowright"]) dx += 1;

    if (dx === 0 && dy === 0) {
        const targetX = mouse.x - window.innerWidth / 2;
        const targetY = mouse.y - window.innerHeight / 2;

        dx = targetX;
        dy = targetY;
    }

    const length = Math.hypot(dx, dy);

    if (length > 5) {
        const speed = Math.max(
            1.4,
            player.speed - player.radius * 0.012
        );

        player.x += (dx / length) * speed;
        player.y += (dy / length) * speed;
    }

    player.x = clamp(
        player.x,
        player.radius,
        WORLD - player.radius
    );

    player.y = clamp(
        player.y,
        player.radius,
        WORLD - player.radius
    );
}

// ========================================
// BOT AI
// ========================================

function updateBots() {
    for (const bot of bots) {
        bot.thinkTime--;

        if (bot.thinkTime <= 0) {
            bot.thinkTime = random(35, 110);

            bot.targetX = random(0, WORLD);
            bot.targetY = random(0, WORLD);

            // Larger bots sometimes chase the player.
            if (
                player &&
                bot.radius > player.radius * 1.2 &&
                Math.random() < 0.55
            ) {
                bot.targetX = player.x;
                bot.targetY = player.y;
            }

            // Smaller bots try to escape larger players.
            if (
                player &&
                player.radius > bot.radius * 1.2 &&
                Math.random() < 0.7
            ) {
                bot.targetX = clamp(
                    bot.x + (bot.x - player.x) * 3,
                    0,
                    WORLD
                );

                bot.targetY = clamp(
                    bot.y + (bot.y - player.y) * 3,
                    0,
                    WORLD
                );
            }
        }

        let dx = bot.targetX - bot.x;
        let dy = bot.targetY - bot.y;

        const length = Math.hypot(dx, dy);

        if (length > 2) {
            const speed = bot.speed * Math.max(
                0.65,
                1 - bot.radius * 0.008
            );

            bot.x += (dx / length) * speed;
            bot.y += (dy / length) * speed;
        }

        bot.x = clamp(bot.x, bot.radius, WORLD - bot.radius);
        bot.y = clamp(bot.y, bot.radius, WORLD - bot.radius);
    }
}

// ========================================
// EATING FOOD
// ========================================

function updateFoodCollisions() {
    const creatures = [player, ...bots].filter(Boolean);

    for (const creature of creatures) {
        for (let i = foods.length - 1; i >= 0; i--) {
            const food = foods[i];

            if (
                distance(creature, food) <
                creature.radius + food.radius
            ) {
                creature.radius = Math.min(
                    250,
                    creature.radius + 0.7
                );

                foods.splice(i, 1);
            }
        }
    }

    while (foods.length < FOOD_AMOUNT) {
        foods.push(createFood());
    }
}

// ========================================
// EATING OTHER FISH
// ========================================

function eatCreature(eater, victim) {
    if (eater.radius <= victim.radius * 1.15) {
        return false;
    }

    if (
        distance(eater, victim) <
        eater.radius * 0.78
    ) {
        eater.radius = Math.min(
            250,
            eater.radius + victim.radius * 0.22
        );

        return true;
    }

    return false;
}

function updateEating() {
    for (let i = bots.length - 1; i >= 0; i--) {
        const bot = bots[i];

        // Player eats bots.
        if (eatCreature(player, bot)) {
            bots.splice(i, 1);
            continue;
        }

        // Bots eat each other.
        for (let j = bots.length - 1; j >= 0; j--) {
            if (i === j) continue;

            const other = bots[j];

            if (eatCreature(bot, other)) {
                bots.splice(j, 1);

                if (j < i) i--;
            }
        }

        // Bots can eat the player.
        if (
            player &&
            eatCreature(bot, player)
        ) {
            player.radius = 18;
            player.x = WORLD / 2;
            player.y = WORLD / 2;

            scoreText.textContent = "YOU WERE EATEN! SIZE: 18";
        }
    }

    // Replace bots that were eaten.
    while (bots.length < BOT_AMOUNT) {
        bots.push(createBot(bots.length));
    }
}

// ========================================
// DRAWING
// ========================================

function drawGrid() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.fillStyle = "#e9f7f7";
    ctx.fillRect(0, 0, width, height);

    const gridSize = 50;

    const offsetX = -camera.x % gridSize;
    const offsetY = -camera.y % gridSize;

    ctx.strokeStyle = "#d0e4e6";
    ctx.lineWidth = 1;

    ctx.beginPath();

    for (let x = offsetX; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }

    for (let y = offsetY; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }

    ctx.stroke();
}

function worldToScreen(creature) {
    return {
        x: creature.x - camera.x + window.innerWidth / 2,
        y: creature.y - camera.y + window.innerHeight / 2
    };
}

function drawFish(creature, isPlayer = false) {
    const position = worldToScreen(creature);

    if (
        position.x < -creature.radius - 20 ||
        position.x > window.innerWidth + creature.radius + 20 ||
        position.y < -creature.radius - 20 ||
        position.y > window.innerHeight + creature.radius + 20
    ) {
        return;
    }

    ctx.beginPath();
    ctx.arc(
        position.x,
        position.y,
        creature.radius,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = creature.color;
    ctx.fill();

    ctx.lineWidth = isPlayer ? 4 : 2;
    ctx.strokeStyle = "rgba(40, 65, 75, 0.18)";
    ctx.stroke();

    // Fish eye.
    ctx.beginPath();
    ctx.arc(
        position.x + creature.radius * 0.35,
        position.y - creature.radius * 0.18,
        Math.max(2, creature.radius * 0.12),
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "#263b43";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
        position.x + creature.radius * 0.39,
        position.y - creature.radius * 0.22,
        Math.max(1, creature.radius * 0.045),
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "white";
    ctx.fill();

    // Player/bot name.
    ctx.fillStyle = "#344a53";
    ctx.font = "bold 13px Nunito, Arial";
    ctx.textAlign = "center";

    ctx.fillText(
        creature.name,
        position.x,
        position.y + creature.radius + 19
    );
}

function drawFoods() {
    for (const food of foods) {
        const position = worldToScreen(food);

        if (
            position.x < -20 ||
            position.x > window.innerWidth + 20 ||
            position.y < -20 ||
            position.y > window.innerHeight + 20
        ) {
            continue;
        }

        ctx.beginPath();
        ctx.arc(
            position.x,
            position.y,
            food.radius,
            0,
            Math.PI * 2
        );

        ctx.fillStyle = food.color;
        ctx.fill();
    }
}

// ========================================
// CAMERA
// ========================================

function updateCamera() {
    if (!player) return;

    camera.x += (player.x - camera.x) * 0.09;
    camera.y += (player.y - camera.y) * 0.09;
}

// ========================================
// GAME LOOP
// ========================================

function gameLoop() {
    if (!playing) return;

    updatePlayer();
    updateBots();
    updateFoodCollisions();
    updateEating();
    updateCamera();

    drawGrid();
    drawFoods();

    for (const bot of bots) {
        drawFish(bot);
    }

    drawFish(player, true);

    scoreText.textContent =
        "SIZE: " + Math.floor(player.radius);

    animationFrame = requestAnimationFrame(gameLoop);
}

// ========================================
// SETTINGS
// ========================================

document.getElementById("showFish").addEventListener(
    "change",
    (event) => {
        document.body.classList.toggle(
            "hide-fish",
            !event.target.checked
        );
    }
);

console.log("GoldfishMan offline game loaded.");
console.log("Press CTRL + ALT + I to toggle Offline Test Mode.");
