export type Role = "Builder" | "Coder" | "Driver" | "Designer" | "Notebooker";
export type RoleId = "builder" | "coder" | "driver" | "designer" | "notebooker";

export type Member = {
  name: string;
  roles: Role[];
  roleId: RoleId;
  title?: "Captain" | "Co-Captain" | "Moral Support";
  experienceYears: number;
  grade: string;
  avatar?: string;
  portraitPx?: string;
  portraitTrue?: string;
};

export const team: Member[] = [
  {
    name: "Andy L.",
    roles: ["Coder", "Driver"],
    roleId: "coder",
    title: "Captain",
    experienceYears: 3,
    grade: "7th",
    avatar: "/team/andy.jpg",
    portraitPx: "/team/andy-px.png",
    portraitTrue: "/team/andy.jpg",
  },
  {
    name: "Raymond J.",
    roles: ["Driver", "Builder", "Notebooker"],
    roleId: "driver",
    title: "Co-Captain",
    experienceYears: 2,
    grade: "6th",
    avatar: "/team/rayray.jpg",
    portraitPx: "/team/rayray-px.png",
    portraitTrue: "/team/rayray.jpg",
  },
  {
    name: "Sophia B.",
    roles: ["Designer", "Coder"],
    roleId: "designer",
    experienceYears: 1,
    grade: "8th",
    avatar: "/team/sophia.jpg",
    portraitPx: "/team/sophia-px.png",
    portraitTrue: "/team/sophia.jpg",
  },
  {
    name: "Clay L.",
    roles: ["Builder"],
    roleId: "builder",
    title: "Moral Support",
    experienceYears: 1,
    grade: "8th",
    avatar: "/team/clay.jpg",
    portraitPx: "/team/clay-px.png",
    portraitTrue: "/team/clay.jpg",
  },
  {
    name: "Gavin H.",
    roles: ["Notebooker", "Builder"],
    roleId: "notebooker",
    experienceYears: 2,
    grade: "8th",
    avatar: "/team/gavin.jpg",
    portraitPx: "/team/gavin-px.png",
    portraitTrue: "/team/gavin.jpg",
  },
];
