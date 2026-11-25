
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const menu = document.getElementById("mainMenu");
const screen = document.getElementById("gameScreen");
const username = document.getElementById("username");

const healthBar = document.getElementById("healthBar");
const healthText = document.getElementById("healthText");
const killsText = document.getElementById("kills");
const ammoText = document.getElementById("ammo");
const blockCount = document.getElementById("blockCount");
const message = document.getElementById("message");

const WORLD = 3200;
const BOT_COUNT = 12;
const FOOD_COUNT = 300;
const BLOCK_LIMIT = 40;

let running = false;
let animationId;
let lastTime = 0;

let player;
let bots = [];
let foods = [];
let bullets = [];
let blocks = [];

let selected = 1;
let mouseDown = false;
let mouse = { x: 0, y: 0 };
let camera = { x: WORLD / 2, y: WORLD / 2 };

let keys = {};
let kills = 0;
let blockInventory = 30;

let ammo = 12;
const MAGAZINE = 12;
let reloading = false;

let nextId = 1;

const COLORS = [
    "#ff9c42", "#ff6385", "#42d6b5",
    "#64b8ed", "#b58bff", "#e8c05c",
    "#ff7959", "#52c6cf"
];

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function color() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ======================================
// CANVAS
// ======================================

function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);

    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;

    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

addEventListener("resize", resize);
resize();

// ======================================
// PLAYER
// ======================================

function makeFish(name, isPlayer = false) {
    return {
        id: nextId++,
        name,
        x: rand(150, WORLD - 150),
        y: rand(150, WORLD - 150),
        radius: isPlayer ? 25 : rand(18, 32),
        angle: 0,
        color: isPlayer ? "#ff9c42" : color(),
        health: 100,
        maxHealth: 100,
        speed: isPlayer ? 3.8 : rand(2, 3.1),
        isPlayer,
        alive: true,
        aiTimer: 0,
        targetX: rand(0, WORLD),
        targetY: rand(0, WORLD),
        fireTimer: rand(40, 100),
        attackTimer: 0,
        invincible: 0
    };
}

function startGame() {
    const name = username.value.trim().slice(0, 16);

    if (!name) {
        document.getElementById("error").textContent =
            "Enter your fish name first.";
        return;
    }

    player = makeFish(name, true);
    player.x = WORLD / 2;
    player.y = WORLD / 2;

    bots = [];
    foods = [];
    bullets = [];
    blocks = [];

    kills = 0;
    ammo = MAGAZINE;
    blockInventory = 30;
    selected = 1;
    reloading = false;

    for (let i = 0; i < BOT_COUNT; i++) {
        bots.push(makeFish("Fish_" + (i + 1)));
    }

    for (let i = 0; i < FOOD_COUNT; i++) {
        foods.push({
            x: rand(0, WORLD),
            y: rand(0, WORLD),
            radius: rand(3, 6),
            color: color()
        });
    }

    menu.style.display = "none";
    screen.style.display = "block";

    updateInventory();
    updateHUD();

    running = true;
    lastTime = performance.now();
    animationId = requestAnimationFrame(loop);
}

document.getElementById("play").addEventListener("click", startGame);

document.getElementById("exitGame").addEventListener("click", () => {
    running = false;
    cancelAnimationFrame(animationId);
    screen.style.display = "none";
    menu.style.display = "grid";
});

// ======================================
// INPUT
// ======================================

addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (
        ["w", "a", "s", "d", " "].includes(key) ||
        key.startsWith("arrow")
    ) {
        event.preventDefault();
    }

    keys[key] = true;

    if (key === "1") selectSlot(1);
    if (key === "2") selectSlot(2);
    if (key === "3") selectSlot(3);

    if (key === "r") reload();
});

addEventListener("keyup", event => {
    keys[event.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", event => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
});

canvas.addEventListener("mousedown", event => {
    if (event.button === 0) {
        mouseDown = true;
        useWeapon();
    }

    if (event.button === 2) {
        placeBlock();
    }
});

addEventListener("mouseup", event => {
    if (event.button === 0) mouseDown = false;
});

canvas.addEventListener("contextmenu", event => {
    event.preventDefault();
});

document.querySelectorAll(".slot").forEach(slot => {
    slot.addEventListener("click", () => {
        selectSlot(Number(slot.dataset.slot));
    });
});

// ======================================
// INVENTORY
// ======================================

function selectSlot(number) {
    selected = number;
    updateInventory();
}

function updateInventory() {
    document.querySelectorAll(".slot").forEach(slot => {
        slot.classList.toggle(
            "selected",
            Number(slot.dataset.slot) === selected
        );
    });

    blockCount.textContent = blockInventory;
}

function updateHUD() {
    if (!player) return;

    const health = clamp(player.health, 0, 100);

    healthBar.style.width = health + "%";
    healthText.textContent = Math.ceil(health) + " HP";

    killsText.textContent = "KILLS: " + kills;
    ammoText.textContent =
        "AMMO: " + ammo + " / " + MAGAZINE;

    blockCount.textContent = blockInventory;
}

// ======================================
// AIMING
// ======================================

function getAimAngle() {
    const screenX = player.x - camera.x + innerWidth / 2;
    const screenY = player.y - camera.y + innerHeight / 2;

    return Math.atan2(
        mouse.y - screenY,
        mouse.x - screenX
    );
}

// ======================================
// PLAYER MOVEMENT
// ======================================

function movePlayer(dt) {
    let dx = 0;
    let dy = 0;

    if (keys.w || keys.arrowup) dy--;
    if (keys.s || keys.arrowdown) dy++;
    if (keys.a || keys.arrowleft) dx--;
    if (keys.d || keys.arrowright) dx++;

    const length = Math.hypot(dx, dy);

    if (length > 0) {
        dx /= length;
        dy /= length;

        player.x += dx * player.speed * dt;
        player.y += dy * player.speed * dt;

        player.angle = Math.atan2(dy, dx);
    } else {
        player.angle = getAimAngle();
    }

    player.x = clamp(player.x, player.radius, WORLD - player.radius);
    player.y = clamp(player.y, player.radius, WORLD - player.radius);
}

// ======================================
// BOT AI
// ======================================

function updateBots(dt) {
    for (const bot of bots) {
        bot.aiTimer -= dt;
        bot.fireTimer -= dt;

        let target = null;

        if (distance(bot, player) < 750) {
            target = player;
        }

        if (bot.aiTimer <= 0) {
            bot.aiTimer = rand(40, 100);

            if (target && Math.random() < 0.65) {
                bot.targetX = target.x + rand(-120, 120);
                bot.targetY = target.y + rand(-120, 120);
            } else {
                bot.targetX = rand(100, WORLD - 100);
                bot.targetY = rand(100, WORLD - 100);
            }
        }

        let dx = bot.targetX - bot.x;
        let dy = bot.targetY - bot.y;
        const length = Math.hypot(dx, dy);

        if (length > 3) {
            dx /= length;
            dy /= length;

            bot.x += dx * bot.speed * dt;
            bot.y += dy * bot.speed * dt;

            bot.angle = Math.atan2(dy, dx);
        }

        bot.x = clamp(bot.x, bot.radius, WORLD - bot.radius);
        bot.y = clamp(bot.y, bot.radius, WORLD - bot.radius);

        // Bots occasionally shoot at the player.
        if (
            target &&
            bot.fireTimer <= 0 &&
            distance(bot, player) < 600
        ) {
            bot.fireTimer = rand(90, 150);
            fireBullet(bot, player, false);
        }
    }
}

// ======================================
// WEAPONS
// ======================================

function useWeapon() {
    if (!running) return;

    if (selected === 1) {
        shoot();
    } else if (selected === 2) {
        punch();
    }
}

function shoot() {
    if (reloading || ammo <= 0) {
        if (ammo <= 0) reload();
        return;
    }

    ammo--;

    const angle = getAimAngle();

    bullets.push({
        x: player.x + Math.cos(angle) * (player.radius + 12),
        y: player.y + Math.sin(angle) * (player.radius + 12),
        vx: Math.cos(angle) * 12,
        vy: Math.sin(angle) * 12,
        owner: player.id,
        damage: 25,
        life: 65,
        radius: 5
    });

    updateHUD();
}

function fireBullet(shooter, target, isPlayer) {
    const angle = Math.atan2(
        target.y - shooter.y,
        target.x - shooter.x
    );

    bullets.push({
        x: shooter.x + Math.cos(angle) * shooter.radius,
        y: shooter.y + Math.sin(angle) * shooter.radius,
        vx: Math.cos(angle) * 9,
        vy: Math.sin(angle) * 9,
        owner: shooter.id,
        damage: 12,
        life: 80,
        radius: 4
    });
}

function reload() {
    if (reloading || ammo === MAGAZINE) return;

    reloading = true;
    showMessage("RELOADING...");

    setTimeout(() => {
        if (!running) return;

        ammo = MAGAZINE;
        reloading = false;
        updateHUD();
    }, 1200);
}

function punch() {
    const angle = getAimAngle();

    const targetX = player.x + Math.cos(angle) * 55;
    const targetY = player.y + Math.sin(angle) * 55;

    for (let i = bots.length - 1; i >= 0; i--) {
        const bot = bots[i];

        if (
            Math.hypot(bot.x - targetX, bot.y - targetY) <
            bot.radius + 30
        ) {
            damageFish(bot, 25, player);
            break;
        }
    }

    hitBlockAt(targetX, targetY);
}

// ======================================
// BULLET UPDATES
// ======================================

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;

        let removed = bullet.life <= 0;

        // Hit blocks.
        for (const block of blocks) {
            if (
                bullet.x > block.x - block.size / 2 &&
                bullet.x < block.x + block.size / 2 &&
                bullet.y > block.y - block.size / 2 &&
                bullet.y < block.y + block.size / 2
            ) {
                damageBlock(block);
                removed = true;
                break;
            }
        }

        if (!removed) {
            const targets = [player, ...bots];

            for (const target of targets) {
                if (!target || !target.alive) continue;
                if (target.id === bullet.owner) continue;

                if (
                    Math.hypot(
                        bullet.x - target.x,
                        bullet.y - target.y
                    ) < target.radius
                ) {
                    const owner = bullet.owner === player.id
                        ? player
                        : bots.find(b => b.id === bullet.owner);

                    damageFish(target, bullet.damage, owner);
                    removed = true;
                    break;
                }
            }
        }

        if (removed) bullets.splice(i, 1);
    }
}

// ======================================
// FISH DAMAGE AND RESPAWNING
// ======================================

function damageFish(target, amount, attacker) {
    if (!target || target.invincible > 0) return;

    target.health -= amount;

    if (target.health <= 0) {
        if (target === player) {
            respawnPlayer();
        } else {
            if (attacker === player) {
                kills++;
                showMessage("FISH ELIMINATED!");
            }

            const index = bots.indexOf(target);
            if (index !== -1) {
                bots.splice(index, 1);
                bots.push(makeFish("Fish_" + (bots.length + 1)));
            }
        }
    }

    updateHUD();
}

function respawnPlayer() {
    showMessage("YOU WERE ELIMINATED!");

    player.health = 100;
    player.x = WORLD / 2;
    player.y = WORLD / 2;
    player.invincible = 120;

    ammo = MAGAZINE;
    updateHUD();
}

// ======================================
// BUILDING BLOCKS
// ======================================

function placeBlock() {
    if (!running || selected !== 3) return;
    if (blockInventory <= 0) {
        showMessage("NO BLOCKS LEFT!");
        return;
    }

    const world = screenToWorld(mouse.x, mouse.y);

    if (distance(player, world) > 230) {
        showMessage("TOO FAR AWAY!");
        return;
    }

    const size = 58;

    const collision = blocks.some(block =>
        Math.abs(block.x - world.x) < size &&
        Math.abs(block.y - world.y) < size
    );

    if (collision) {
        showMessage("BLOCK LOCATION TAKEN!");
        return;
    }

    blocks.push({
        x: Math.round(world.x / size) * size,
        y: Math.round(world.y / size) * size,
        size,
        health: 3,
        maxHealth: 3
    });

    blockInventory--;
    updateInventory();
}

function hitBlockAt(x, y) {
    for (const block of blocks) {
        if (
            Math.abs(block.x - x) < block.size / 2 + 25 &&
            Math.abs(block.y - y) < block.size / 2 + 25
        ) {
            damageBlock(block);
            return;
        }
    }
}

function damageBlock(block) {
    block.health--;

    if (block.health <= 0) {
        blocks.splice(blocks.indexOf(block), 1);
        showMessage("BLOCK DESTROYED!");
    }
}

// ======================================
// FOOD
// ======================================

function updateFood() {
    for (let i = foods.length - 1; i >= 0; i--) {
        const food = foods[i];

        if (distance(player, food) < player.radius + food.radius) {
            player.radius = Math.min(65, player.radius + 0.5);
            foods.splice(i, 1);
        }
    }

    while (foods.length < FOOD_COUNT) {
        foods.push({
            x: rand(0, WORLD),
            y: rand(0, WORLD),
            radius: rand(3, 6),
            color: color()
        });
    }
}

// ======================================
// CAMERA
// ======================================

function screenToWorld(x, y) {
    return {
        x: x + camera.x - innerWidth / 2,
        y: y + camera.y - innerHeight / 2
    };
}

function updateCamera(dt) {
    camera.x += (player.x - camera.x) * Math.min(1, 0.09 * dt);
    camera.y += (player.y - camera.y) * Math.min(1, 0.09 * dt);
}

// ======================================
// DRAWING
// ======================================

function drawWater() {
    const width = innerWidth;
    const height = innerHeight;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#08758a");
    gradient.addColorStop(0.5, "#07516f");
    gradient.addColorStop(1, "#063b58");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Underwater light ripples.
    const time = performance.now() * 0.0004;

    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = "#b4fff0";
    ctx.lineWidth = 2;

    for (let i = 0; i < 14; i++) {
        const x = ((i * 245 + time * 60) % (width + 200)) - 100;
        const y = (i * 137 + Math.sin(time + i) * 30) % height;

        ctx.beginPath();
        ctx.ellipse(x, y, 75, 18, Math.sin(time + i), 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();

    // Subtle arena grid.
    const grid = 100;
    const ox = -camera.x % grid;
    const oy = -camera.y % grid;

    ctx.strokeStyle = "rgba(160,235,231,.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = ox; x < width; x += grid) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }

    for (let y = oy; y < height; y += grid) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }

    ctx.stroke();
}

function worldPosition(object) {
    return {
        x: object.x - camera.x + innerWidth / 2,
        y: object.y - camera.y + innerHeight / 2
    };
}

function drawFish(fish) {
    const pos = worldPosition(fish);

    if (
        pos.x < -100 || pos.x > innerWidth + 100 ||
        pos.y < -100 || pos.y > innerHeight + 100
    ) return;

    const swim = Math.sin(performance.now() * 0.012 + fish.id) * 0.14;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(fish.angle + swim * 0.15);

    // Tail animation.
    ctx.fillStyle = fish.color;
    ctx.beginPath();
    ctx.moveTo(-fish.radius * 0.55, 0);
    ctx.lineTo(-fish.radius * 1.5, -fish.radius * (0.65 + swim));
    ctx.lineTo(-fish.radius * 1.5, fish.radius * (0.65 + swim));
    ctx.closePath();
    ctx.fill();

    // Fins.
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(-fish.radius * 0.15, -fish.radius * 0.5);
    ctx.lineTo(fish.radius * 0.25, -fish.radius * 1.0);
    ctx.lineTo(fish.radius * 0.65, -fish.radius * 0.45);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-fish.radius * 0.15, fish.radius * 0.5);
    ctx.lineTo(fish.radius * 0.25, fish.radius * 1.0);
    ctx.lineTo(fish.radius * 0.65, fish.radius * 0.45);
    ctx.fill();

    ctx.globalAlpha = 1;

    // Main body.
    ctx.beginPath();
    ctx.ellipse(0, 0, fish.radius, fish.radius * 0.68, 0, 0, Math.PI * 2);
    ctx.fillStyle = fish.color;
    ctx.fill();

    ctx.lineWidth = fish.isPlayer ? 3 : 1.5;
    ctx.strokeStyle = "#ffffff66";
    ctx.stroke();

    // Scales.
    ctx.strokeStyle = "#ffffff40";
    ctx.lineWidth = 1;

    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * fish.radius * 0.25, 0, fish.radius * 0.3, -1.1, 1.1);
        ctx.stroke();
    }

    // Eye.
    ctx.beginPath();
    ctx.arc(fish.radius * 0.56, -fish.radius * 0.16, Math.max(2, fish.radius * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = "#122c39";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(fish.radius * 0.59, -fish.radius * 0.2, Math.max(1, fish.radius * 0.04), 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();

    ctx.restore();

    // Health indicator.
    if (!fish.isPlayer) {
        const barWidth = fish.radius * 2;
        const hp = clamp(fish.health / fish.maxHealth, 0, 1);

        ctx.fillStyle = "#062b3b99";
        ctx.fillRect(pos.x - barWidth / 2, pos.y - fish.radius - 14, barWidth, 4);

        ctx.fillStyle = "#49e2a2";
        ctx.fillRect(pos.x - barWidth / 2, pos.y - fish.radius - 14, barWidth * hp, 4);
    }

    ctx.fillStyle = "white";
    ctx.font = "bold 12px Nunito, Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = "#002c3b";
    ctx.shadowBlur = 5;
    ctx.fillText(fish.name, pos.x, pos.y + fish.radius + 18);
    ctx.shadowBlur = 0;
}

function drawFoods() {
    for (const food of foods) {
        const pos = worldPosition(food);

        if (
            pos.x < -20 || pos.x > innerWidth + 20 ||
            pos.y < -20 || pos.y > innerHeight + 20
        ) continue;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, food.radius, 0, Math.PI * 2);
        ctx.fillStyle = food.color;
        ctx.shadowColor = food.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function drawBlocks() {
    for (const block of blocks) {
        const pos = worldPosition(block);
        const half = block.size / 2;

        ctx.fillStyle = "#6b8791";
        ctx.fillRect(pos.x - half, pos.y - half, block.size, block.size);

        ctx.fillStyle = "#a4bdc3";
        ctx.fillRect(pos.x - half + 5, pos.y - half + 5, block.size - 10, 9);

        ctx.strokeStyle = "#d5e9e7";
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - half, pos.y - half, block.size, block.size);

        // Three hit indicators.
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i < block.health ? "#f6b34e" : "#274552";
            ctx.fillRect(
                pos.x - 19 + i * 14,
                pos.y + 10,
                10,
                5
            );
        }

        ctx.strokeStyle = "#d9f3ef66";
        ctx.beginPath();
        ctx.moveTo(pos.x - half + 12, pos.y - half + 18);
        ctx.lineTo(pos.x - 5, pos.y + 4);
        ctx.stroke();
    }
}

function drawBullets() {
    for (const bullet of bullets) {
        const pos = worldPosition(bullet);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe49b";
        ctx.shadowColor = "#fff2a6";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function drawAim() {
    const pos = worldPosition(player);

    ctx.strokeStyle = "#ffffff88";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 7]);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(mouse.x, mouse.y);
    ctx.stroke();

    ctx.setLineDash([]);
}

// ======================================
// BLOCK PLACEMENT PREVIEW
// ======================================

function drawBlockPreview() {
    if (selected !== 3) return;

    const world = screenToWorld(mouse.x, mouse.y);
    const size = 58;

    const x = Math.round(world.x / size) * size;
    const y = Math.round(world.y / size) * size;
    const pos = worldPosition({ x, y });

    ctx.fillStyle = distance(player, { x, y }) <= 230
        ? "#a9e9cf66"
        : "#ff6b6b66";

    ctx.strokeStyle = "#ffffffaa";
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(pos.x - size / 2, pos.y - size / 2, size, size);
    ctx.setLineDash([]);
    ctx.fillRect(pos.x - size / 2, pos.y - size / 2, size, size);
}

// ======================================
// MESSAGE
// ======================================

let messageTimer;

function showMessage(text) {
    message.textContent = text;
    clearTimeout(messageTimer);

    messageTimer = setTimeout(() => {
        message.textContent = "";
    }, 1400);
}

// ======================================
// GAME LOOP
// ======================================

function loop(time) {
    if (!running) return;

    const dt = Math.min((time - lastTime) / 16.67, 2);
    lastTime = time;

    if (player.invincible > 0) player.invincible -= dt;

    movePlayer(dt);
    updateBots(dt);
    updateFood();
    updateBullets(dt);
    updateCamera(dt);

    drawWater();
    drawFoods();
    drawBlocks();
    drawBullets();

    for (const bot of bots) drawFish(bot);

    drawFish(player);
    drawAim();
    drawBlockPreview();

    updateHUD();

    animationId = requestAnimationFrame(loop);
}
