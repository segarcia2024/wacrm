import { getRequestConfig } from "next-intl/server";

import en from "../../messages/en.json";
import esCO from "../../messages/es-CO.json";

const CATALOGS: Record<string, typeof en> = {
  en,
  "es-CO": esCO,
};

export default getRequestConfig(async () => {
  const locale = process.env.NEXT_PUBLIC_APP_LOCALE || "en";
  const messages = CATALOGS[locale] ?? en;

  return {
    locale: CATALOGS[locale] ? locale : "en",
    messages,
  };
});
