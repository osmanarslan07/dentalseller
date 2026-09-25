import { common } from "./common";
import { nav } from "./nav";
import { dashboard } from "./dashboard";
import { patients } from "./patients";
import { patientPage } from "./patientPage";
import { activity } from "./activity";
import { money } from "./money";
import { ops } from "./ops";
import { sales } from "./sales";
import { settings } from "./settings";
import { settings2 } from "./settings2";
import { users } from "./users";
import { auth } from "./auth";
import { server } from "./server";
import { platform } from "./platform";

/**
 * Turkish dictionary: English text → Turkish. One file per area of the app; later files win on
 * a clash. Key terms (seller, coordinator, visit, quote…) are fixed in ./common's GLOSSARY
 * block — change a term there and search this folder for the old word to follow it through.
 */
export const TR: Record<string, string> = {
  ...common,
  ...nav,
  ...dashboard,
  ...patients,
  ...patientPage,
  ...activity,
  ...money,
  ...ops,
  ...sales,
  ...settings,
  ...settings2,
  ...users,
  ...auth,
  ...server,
  ...platform,
};
