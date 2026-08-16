import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const matches: Array<{ topic: string; words: string[] }> = [
  { topic: "fashion", words: ["мод", "одежд", "стил", "лук", "fashion", "style"] },
  { topic: "street", words: ["улиц", "город", "архитект", "street", "urban"] },
  { topic: "portrait", words: ["портрет", "лиц", "человек", "portrait", "person"] },
  { topic: "landscape", words: ["пейзаж", "природ", "лес", "горы", "море", "landscape", "nature"] },
  { topic: "travel", words: ["путешеств", "поездк", "страна", "отпуск", "travel"] },
  { topic: "technology", words: ["технолог", "техник", "гаджет", "компьют", "робот", "technology"] },
];

const labels: Record<string, string> = {
  fashion: "Мода",
  street: "Уличная фотография",
  portrait: "Портреты",
  landscape: "Пейзажи",
  travel: "Путешествия",
  technology: "Технологии",
};

export function matchTopic(query: string): string | undefined {
  const normalized = query.trim().toLocaleLowerCase("ru-RU");
  if (normalized.length < 2) return undefined;
  return matches.find(({ words }) => words.some((word) => normalized.includes(word)))?.topic;
}

composer.on("message:text", async (ctx) => {
  const query = ctx.message.text.trim();
  if (query.startsWith("/")) return;
  const topic = matchTopic(query);
  if (!topic) {
    await ctx.reply("Не нашёл подходящую тему. Попробуйте написать о моде, городе, портрете, природе, поездках или технологиях.");
    return;
  }
  await ctx.reply(`Подойдёт тема «${labels[topic]}».`, {
    reply_markup: inlineKeyboard([[inlineButton("Показать фото", `topic:${topic}`)]]),
  });
});

export default composer;
