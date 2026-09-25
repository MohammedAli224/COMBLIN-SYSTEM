import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";

const savedLanguage = localStorage.getItem("nursing-platform-language");
const initialLanguage = savedLanguage === "en" ? "en" : "ar";

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

document.documentElement.lang = initialLanguage;
document.documentElement.dir = initialLanguage === "ar" ? "rtl" : "ltr";

export default i18n;
