import { archHall, pointedHall } from "./arch-hall.mjs";
import { cabin } from "./cabin.mjs";
import { dome, lavvo } from "./round.mjs";
import { shed } from "./shed.mjs";
import { wedge } from "./wedge.mjs";

// Every building drawn by the generic sheet, in the order of the drawing set.
export const buildings = [cabin, shed, wedge, archHall, pointedHall, lavvo, dome];
export { archHall, cabin, dome, lavvo, pointedHall, shed, wedge };
