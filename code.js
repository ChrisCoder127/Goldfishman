// Goldfish Arena server: one Durable Object = one shared arena.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TICK = 50;            // ms (20 updates/sec)
const SIZE = 2400;          // arena width/height
const MIN_PLAYERS = 6;      // bots fill the arena up to this many fish
const NAMES = ["Bubbles", "Nemo", "Flash", "Koi", "Sushi", "Finn", "Goldie", "Wanda"];

export class Arena {
  constructor() {
    this.fish = new Map();
    this.arrows = [];
    this.nextId = 1;
    this.timer = null;
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const id = this.nextId++;
    let me = null;

    server.addEventListener("message", (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "join" && !me) {
        me = this.spawn(id, String(m.name || "Goldfish").slice(0, 14), server);
        this.fish.set(id, me);
        server.send(JSON.stringify({ t: "hi", id, size: SIZE }));
        this.start();
      } else if (m.t === "in" && me) {
        me.dx = clamp(+m.x || 0, -1, 1);
        me.dy = clamp(+m.y || 0, -1, 1);
      }
    });
    const leave = () => this.fish.delete(id);
    server.addEventListener("close", leave);
    server.addEventListener("error", leave);
    return new Response(null, { status: 101, webSocket: client });
  }

  spawn(id, name, ws = null, bot = false) {
    return {
      id, name, ws, bot,
      x: 200 + Math.random() * (SIZE - 400), y: 200 + Math.random() * (SIZE - 400),
      dx: 0, dy: 0, hp: 100, kills: 0, cd: 0, deadFor: 0,
      tx: 0, ty: 0, retarget: 0,
    };
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(TICK / 1000), TICK);
  }

  tick(dt) {
    const humans = [...this.fish.values()].filter((f) => !f.bot);
    if (!humans.length) {               // nobody here: stop and clear bots
      clearInterval(this.timer); this.timer = null;
      this.fish.clear(); this.arrows = [];
      return;
    }
    // keep bots topped up
    let bots = [...this.fish.values()].filter((f) => f.bot).length;
    while (humans.length + bots < MIN_PLAYERS) {
      const id = this.nextId++;
      this.fish.set(id, this.spawn(id, NAMES[id % NAMES.length], null, true));
      bots++;
    }

    for (const f of this.fish.values()) {
      if (f.deadFor > 0) {
        f.deadFor -= dt;
        if (f.deadFor <= 0) Object.assign(f, this.spawn(f.id, f.name, f.ws, f.bot), { kills: 0 });
        continue;
      }
      if (f.bot) this.think(f, dt);
      const len = Math.hypot(f.dx, f.dy) || 1;
      const speed = 230 + Math.min(f.kills, 10) * 8;
      if (f.dx || f.dy) {
        f.x = clamp(f.x + (f.dx / Math.max(1, len)) * speed * dt, 20, SIZE - 20);
        f.y = clamp(f.y + (f.dy / Math.max(1, len)) * speed * dt, 20, SIZE - 20);
      }
      // auto-aim and shoot at nearest living fish in range
      f.cd -= dt;
      if (f.cd <= 0) {
        let best = null, bd = 420;
        for (const o of this.fish.values()) {
          if (o === f || o.deadFor > 0) continue;
          const d = Math.hypot(o.x - f.x, o.y - f.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          const a = Math.atan2(best.y - f.y, best.x - f.x);
          this.arrows.push({ x: f.x, y: f.y, vx: Math.cos(a) * 650, vy: Math.sin(a) * 650, life: 0.8, by: f.id, a });
          f.cd = Math.max(0.35, 0.8 - f.kills * 0.04);
        }
      }
    }

    for (const ar of this.arrows) {
      ar.x += ar.vx * dt; ar.y += ar.vy * dt; ar.life -= dt;
      for (const o of this.fish.values()) {
        if (o.id === ar.by || o.deadFor > 0) continue;
        if (Math.hypot(o.x - ar.x, o.y - ar.y) < 22) {
          const shooter = this.fish.get(ar.by);
          o.hp -= 12 + (shooter ? Math.min(shooter.kills, 10) * 1.5 : 0);
          ar.life = 0;
          if (o.hp <= 0) { o.deadFor = 2.5; if (shooter) shooter.kills++; }
          break;
        }
      }
    }
    this.arrows = this.arrows.filter((a) => a.life > 0);

    const state = JSON.stringify({
      t: "s",
      f: [...this.fish.values()].map((f) => [f.id, Math.round(f.x), Math.round(f.y), Math.round(f.hp), f.name, f.kills, f.deadFor > 0 ? 1 : 0]),
      a: this.arrows.map((a) => [Math.round(a.x), Math.round(a.y), +a.a.toFixed(2)]),
    });
    for (const f of humans) { try { f.ws.send(state); } catch {} }
  }

  think(f, dt) {
    f.retarget -= dt;
    if (f.retarget <= 0) {
      f.retarget = 1 + Math.random() * 2;
      f.tx = 100 + Math.random() * (SIZE - 200); f.ty = 100 + Math.random() * (SIZE - 200);
    }
    const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy) || 1;
    f.dx = (dx / d) * 0.8; f.dy = (dy / d) * 0.8;
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      return env.ARENA.get(env.ARENA.idFromName("main")).fetch(req);
    }
    return new Response("Not found", { status: 404 });
  },
};
