import type { StaticImageData } from "next/image";

import light133 from "@/assets/mlb/teams/light/133.svg";
import dark133 from "@/assets/mlb/teams/dark/133.svg";
import light144 from "@/assets/mlb/teams/light/144.svg";
import dark144 from "@/assets/mlb/teams/dark/144.svg";
import light109 from "@/assets/mlb/teams/light/109.svg";
import dark109 from "@/assets/mlb/teams/dark/109.svg";
import light110 from "@/assets/mlb/teams/light/110.svg";
import dark110 from "@/assets/mlb/teams/dark/110.svg";
import light111 from "@/assets/mlb/teams/light/111.svg";
import dark111 from "@/assets/mlb/teams/dark/111.svg";
import light112 from "@/assets/mlb/teams/light/112.svg";
import dark112 from "@/assets/mlb/teams/dark/112.svg";
import light113 from "@/assets/mlb/teams/light/113.svg";
import dark113 from "@/assets/mlb/teams/dark/113.svg";
import light114 from "@/assets/mlb/teams/light/114.svg";
import dark114 from "@/assets/mlb/teams/dark/114.svg";
import light115 from "@/assets/mlb/teams/light/115.svg";
import dark115 from "@/assets/mlb/teams/dark/115.svg";
import light145 from "@/assets/mlb/teams/light/145.svg";
import dark145 from "@/assets/mlb/teams/dark/145.svg";
import light116 from "@/assets/mlb/teams/light/116.svg";
import dark116 from "@/assets/mlb/teams/dark/116.svg";
import light117 from "@/assets/mlb/teams/light/117.svg";
import dark117 from "@/assets/mlb/teams/dark/117.svg";
import light118 from "@/assets/mlb/teams/light/118.svg";
import dark118 from "@/assets/mlb/teams/dark/118.svg";
import light108 from "@/assets/mlb/teams/light/108.svg";
import dark108 from "@/assets/mlb/teams/dark/108.svg";
import light119 from "@/assets/mlb/teams/light/119.svg";
import dark119 from "@/assets/mlb/teams/dark/119.svg";
import light146 from "@/assets/mlb/teams/light/146.svg";
import dark146 from "@/assets/mlb/teams/dark/146.svg";
import light158 from "@/assets/mlb/teams/light/158.svg";
import dark158 from "@/assets/mlb/teams/dark/158.svg";
import light142 from "@/assets/mlb/teams/light/142.svg";
import dark142 from "@/assets/mlb/teams/dark/142.svg";
import light121 from "@/assets/mlb/teams/light/121.svg";
import light147 from "@/assets/mlb/teams/light/147.svg";
import dark147 from "@/assets/mlb/teams/dark/147.svg";
import light143 from "@/assets/mlb/teams/light/143.svg";
import dark143 from "@/assets/mlb/teams/dark/143.svg";
import light134 from "@/assets/mlb/teams/light/134.svg";
import dark134 from "@/assets/mlb/teams/dark/134.svg";
import light135 from "@/assets/mlb/teams/light/135.svg";
import dark135 from "@/assets/mlb/teams/dark/135.svg";
import light136 from "@/assets/mlb/teams/light/136.svg";
import dark136 from "@/assets/mlb/teams/dark/136.svg";
import light137 from "@/assets/mlb/teams/light/137.svg";
import dark137 from "@/assets/mlb/teams/dark/137.svg";
import light138 from "@/assets/mlb/teams/light/138.svg";
import dark138 from "@/assets/mlb/teams/dark/138.svg";
import light139 from "@/assets/mlb/teams/light/139.svg";
import dark139 from "@/assets/mlb/teams/dark/139.svg";
import light140 from "@/assets/mlb/teams/light/140.svg";
import dark140 from "@/assets/mlb/teams/dark/140.svg";
import light141 from "@/assets/mlb/teams/light/141.svg";
import dark141 from "@/assets/mlb/teams/dark/141.svg";
import light120 from "@/assets/mlb/teams/light/120.svg";
import dark120 from "@/assets/mlb/teams/dark/120.svg";

// Static imports give the official marks content hashes and the existing CDN cache policy.
export const teamMarks: Record<
  number,
  { light: StaticImageData; dark: StaticImageData }
> = {
  133: { light: light133, dark: dark133 },
  144: { light: light144, dark: dark144 },
  109: { light: light109, dark: dark109 },
  110: { light: light110, dark: dark110 },
  111: { light: light111, dark: dark111 },
  112: { light: light112, dark: dark112 },
  113: { light: light113, dark: dark113 },
  114: { light: light114, dark: dark114 },
  115: { light: light115, dark: dark115 },
  145: { light: light145, dark: dark145 },
  116: { light: light116, dark: dark116 },
  117: { light: light117, dark: dark117 },
  118: { light: light118, dark: dark118 },
  108: { light: light108, dark: dark108 },
  119: { light: light119, dark: dark119 },
  146: { light: light146, dark: dark146 },
  158: { light: light158, dark: dark158 },
  142: { light: light142, dark: dark142 },
  // The solid orange Mets mark remains clearer on our graphite canvas.
  121: { light: light121, dark: light121 },
  147: { light: light147, dark: dark147 },
  143: { light: light143, dark: dark143 },
  134: { light: light134, dark: dark134 },
  135: { light: light135, dark: dark135 },
  136: { light: light136, dark: dark136 },
  137: { light: light137, dark: dark137 },
  138: { light: light138, dark: dark138 },
  139: { light: light139, dark: dark139 },
  140: { light: light140, dark: dark140 },
  141: { light: light141, dark: dark141 },
  120: { light: light120, dark: dark120 },
};
