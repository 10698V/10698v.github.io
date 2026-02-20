/**
 * fieldOdometry.ts — Driver: "Aether Drivetrain Pilot"
 * VEX field grid + robot odometry path + pure-pursuit lookahead
 */
import { FrameBudget } from "./frame-budget";
import { registerRafLoop } from "./raf-governor";

type Waypoint = { x: number; y: number };
type RobotState = {
    x: number; y: number; heading: number;
    targetIdx: number; progress: number;
    trailX: number[]; trailY: number[];
};

const FIELD_CELLS = 6;
const LOOKAHEAD_R = 0.12;
const HEADING_CONE_LEN = 0.06;
const TRAIL_MAX = 80;
const RECALC_INTERVAL_MIN = 4000;
const RECALC_INTERVAL_MAX = 8000;

function generatePath(): Waypoint[] {
    const pts: Waypoint[] = [];
    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
        pts.push({ x: 0.12 + Math.random() * 0.76, y: 0.12 + Math.random() * 0.76 });
    }
    return pts;
}

type FieldOdometryOptions = {
    loopId?: string;
    fps?: number;
    dprCaps?: number[];
};

export const attachFieldOdometry = (container: HTMLElement, options: FieldOdometryOptions = {}) => {
    const canvas = document.createElement("canvas");
    canvas.className = "field-odom-canvas";
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => { };
    container.appendChild(canvas);

    const dprCaps = options.dprCaps?.length ? options.dprCaps : [1.5, 1.25, 1.0];
    let width = 0, height = 0;
    let dprTier = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, dprCaps[dprTier] ?? 1.5);
    let running = true;

    const frameBudget = new FrameBudget({
        sampleSize: 90,
        downshiftThresholdMs: 22,
        restoreThresholdMs: 16.5,
        cooldownMs: 1200,
        maxTier: Math.max(0, dprCaps.length - 1),
    });

    let path = generatePath();
    let robot: RobotState = {
        x: path[0].x, y: path[0].y, heading: 0,
        targetIdx: 1, progress: 0,
        trailX: [], trailY: []
    };
    let recalcTimer = 0;
    let recalcFlash = 0;
    let nextRecalc = RECALC_INTERVAL_MIN + Math.random() * (RECALC_INTERVAL_MAX - RECALC_INTERVAL_MIN);

    const resize = () => {
        width = container.clientWidth || 1;
        height = container.clientHeight || 1;
        dpr = Math.min(window.devicePixelRatio || 1, dprCaps[dprTier] ?? dprCaps[dprCaps.length - 1] ?? 1.0);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawGrid = () => {
        const cellW = width / FIELD_CELLS;
        const cellH = height / FIELD_CELLS;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= FIELD_CELLS; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * cellH); ctx.lineTo(width, i * cellH);
            ctx.stroke();
        }
        // Axes
        ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.stroke();
    };

    const drawPath = () => {
        if (path.length < 2) return;
        ctx.strokeStyle = "rgba(100, 217, 255, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(path[0].x * width, path[0].y * height);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x * width, path[i].y * height);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Waypoints
        path.forEach((wp, i) => {
            ctx.beginPath();
            ctx.arc(wp.x * width, wp.y * height, i === robot.targetIdx ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = i === robot.targetIdx ? "rgba(100, 217, 255, 0.9)" : "rgba(100, 217, 255, 0.4)";
            ctx.fill();
        });
    };

    const drawRobot = () => {
        const rx = robot.x * width;
        const ry = robot.y * height;
        const base = Math.min(width, height);

        // Trail
        if (robot.trailX.length > 1) {
            ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(robot.trailX[0], robot.trailY[0]);
            for (let i = 1; i < robot.trailX.length; i++) {
                ctx.lineTo(robot.trailX[i], robot.trailY[i]);
            }
            ctx.stroke();
        }

        // Lookahead circle
        ctx.beginPath();
        ctx.arc(rx, ry, LOOKAHEAD_R * base, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(167, 139, 250, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Heading cone
        const coneLen = HEADING_CONE_LEN * base * 2;
        const coneAng = 0.35;
        ctx.fillStyle = "rgba(56, 189, 248, 0.25)";
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(robot.heading - coneAng) * coneLen, ry + Math.sin(robot.heading - coneAng) * coneLen);
        ctx.lineTo(rx + Math.cos(robot.heading + coneAng) * coneLen, ry + Math.sin(robot.heading + coneAng) * coneLen);
        ctx.closePath();
        ctx.fill();

        // Robot dot
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#64d9ff";
        ctx.shadowColor = "#64d9ff";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    };

    const drawRecalcFlash = () => {
        if (recalcFlash <= 0) return;
        const rx = robot.x * width;
        const ry = robot.y * height;
        const base = Math.min(width, height);
        const r = recalcFlash * base * 0.3;
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(167, 139, 250, ${recalcFlash * 0.8})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    };

    const tick = (deltaMs: number, now: number) => {
        if (!running) return;
        const dt = Math.min(deltaMs / 1000, 0.05);
        const nextTier = frameBudget.push(deltaMs, now);
        if (nextTier !== dprTier) {
            dprTier = nextTier;
            resize();
        }

        // Move robot along path
        if (robot.targetIdx < path.length) {
            const target = path[robot.targetIdx];
            const dx = target.x - robot.x;
            const dy = target.y - robot.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            robot.heading = Math.atan2(dy, dx);

            const speed = 0.15;
            if (dist < 0.02) {
                robot.x = target.x;
                robot.y = target.y;
                robot.targetIdx++;
            } else {
                robot.x += (dx / dist) * speed * dt;
                robot.y += (dy / dist) * speed * dt;
            }
        } else {
            // Reset path
            path = generatePath();
            robot.targetIdx = 0;
            robot.trailX = [];
            robot.trailY = [];
        }

        // Trail
        robot.trailX.push(robot.x * width);
        robot.trailY.push(robot.y * height);
        if (robot.trailX.length > TRAIL_MAX) {
            robot.trailX.shift();
            robot.trailY.shift();
        }

        // Recalc micro-event
        recalcTimer += dt * 1000;
        if (recalcTimer > nextRecalc) {
            recalcTimer = 0;
            nextRecalc = RECALC_INTERVAL_MIN + Math.random() * (RECALC_INTERVAL_MAX - RECALC_INTERVAL_MIN);
            recalcFlash = 1;
            // Re-route: shuffle remaining waypoints slightly
            for (let i = robot.targetIdx; i < path.length; i++) {
                path[i].x = Math.max(0.1, Math.min(0.9, path[i].x + (Math.random() - 0.5) * 0.1));
                path[i].y = Math.max(0.1, Math.min(0.9, path[i].y + (Math.random() - 0.5) * 0.1));
            }
        }
        recalcFlash = Math.max(0, recalcFlash - dt * 2);

        // Render
        ctx.clearRect(0, 0, width, height);
        drawGrid();
        drawPath();
        drawRobot();
        drawRecalcFlash();

    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();
    const loop = registerRafLoop(options.loopId ?? `role-driver:${Math.random().toString(36).slice(2)}`, {
        fps: options.fps ?? 30,
        autoPauseOnHidden: true,
        onTick: ({ deltaMs, now }) => tick(deltaMs, now),
    });
    loop.start();

    return () => {
        running = false;
        loop.destroy();
        ro.disconnect();
        canvas.remove();
    };
};
