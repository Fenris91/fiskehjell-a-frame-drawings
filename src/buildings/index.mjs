import { archHall, pointedHall, segmentalHall } from "./arch-hall.mjs";
import { cabin } from "./cabin.mjs";
import { rack } from "./rack.mjs";
import { dome, lavvo } from "./round.mjs";
import { shed } from "./shed.mjs";
import { wedge } from "./wedge.mjs";

// Every building drawn by the generic sheet, in the order of the drawing set.
export const buildings = [cabin, shed, wedge, rack, archHall, segmentalHall, pointedHall, lavvo, dome];
export { archHall, cabin, dome, lavvo, pointedHall, rack, segmentalHall, shed, wedge };
