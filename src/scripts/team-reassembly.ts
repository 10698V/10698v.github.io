/**
 * team-reassembly.ts
 * Helper to calculate the screen positions (NDC) of Team cards
 * so the Hero blocks can fly to them.
 */

export interface CardRect {
    x: number; // Center X (NDC -1 to 1)
    y: number; // Center Y (NDC -1 to 1)
    w: number; // Width (NDC 0 to 2)
    h: number; // Height (NDC 0 to 2)
    roleId: string;
}

export function getTeamCardRects(): CardRect[] {
    const cards = Array.from(document.querySelectorAll(".tile"));
    if (!cards.length) return [];

    const width = window.innerWidth;
    const height = window.innerHeight;

    return cards.map((card) => {
        const rect = card.getBoundingClientRect();

        // Convert to NDC (-1 to +1)
        // Center X
        const cx = (rect.left + rect.width / 2) / width * 2 - 1;
        // Center Y (inverted because DOM Y is down, GL Y is up)
        const cy = -((rect.top + rect.height / 2) / height * 2 - 1);

        // Width/Height in NDC
        const w = (rect.width / width) * 2;
        const h = (rect.height / height) * 2;

        const roleId = card.getAttribute("data-role") || "unknown";

        return { x: cx, y: cy, w, h, roleId };
    });
}
