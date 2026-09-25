import { cache } from "react";
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, Lang, makeT, T } from "./index";

/** The viewer's language for this request — from the cookie that sign-in and the language
 * switch set from profiles.language. */
export const getLang = cache(async (): Promise<Lang> => {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "en";
});

export async function getT(): Promise<T> {
  return makeT(await getLang());
}
