import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

type TopicId = "fashion" | "street" | "portrait" | "landscape" | "travel" | "technology";

interface Topic {
  id: TopicId;
  name: string;
  search: string;
}

interface PhotoItem {
  url: string;
  attribution: string;
  license: string;
}

interface UserMetrics {
  telegram_id: number;
  last_request_ts: number;
  request_count: number;
  request_day: string;
  current_topic?: TopicId;
  page: number;
}

interface DurableRecordContext {
  env?: { CHAT_DO?: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> } } };
}

const TOPICS: readonly Topic[] = [
  { id: "fashion", name: "Мода", search: "fashion" },
  { id: "street", name: "Уличная фотография", search: "street photography" },
  { id: "portrait", name: "Портреты", search: "portrait photography" },
  { id: "landscape", name: "Пейзажи", search: "landscape photography" },
  { id: "travel", name: "Путешествия", search: "travel photography" },
  { id: "technology", name: "Технологии", search: "technology" },
];

export function registerTopicMenu(): void {
  for (const [index, topic] of TOPICS.entries()) {
    registerMainMenuItem({ label: topic.name, data: `topic:${topic.id}`, order: index + 1 });
  }
  registerMainMenuItem({ label: "Случайная тема", data: "topic:random", order: 7 });
}
registerTopicMenu();

const composer = new Composer<Ctx>();

// One clock seam keeps day-boundary behaviour deterministic in a focused test.
export let now = (): Date => new Date();
export function setClockForTests(clock: () => Date): void {
  now = clock;
}

function topicById(id: string): Topic | undefined {
  return TOPICS.find((topic) => topic.id === id);
}

function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Consume one of the user's daily requests. Returns false at the daily cap. */
export function consumeDailyRequest(user: UserMetrics, current: Date): boolean {
  const today = dayKey(current);
  if (user.request_day !== today) {
    user.request_day = today;
    user.request_count = 0;
    user.page = 0;
  }
  if (user.request_count >= 30) return false;
  user.request_count += 1;
  user.last_request_ts = current.getTime();
  return true;
}

function metrics(ctx: Ctx): UserMetrics {
  const session = ctx.session as { trendyPhotoUser?: UserMetrics };
  const id = ctx.from?.id ?? ctx.chat?.id ?? 0;
  if (!session.trendyPhotoUser || session.trendyPhotoUser.telegram_id !== id) {
    session.trendyPhotoUser = {
      telegram_id: id,
      last_request_ts: 0,
      request_count: 0,
      request_day: dayKey(now()),
      page: 0,
    };
  }
  return session.trendyPhotoUser;
}

async function loadMetrics(ctx: Ctx): Promise<UserMetrics> {
  const worker = ctx as Ctx & DurableRecordContext;
  const id = ctx.from?.id ?? ctx.chat?.id ?? 0;
  const namespace = worker.env?.CHAT_DO;
  if (!namespace) return metrics(ctx);
  try {
    const response = await namespace.get(namespace.idFromName(`chat:${id}`)).fetch(
      `https://do/record/${encodeURIComponent(`trendy-photo-user:${id}`)}`,
      { method: "GET" },
    );
    if (response.status === 200) return await response.json() as UserMetrics;
  } catch {
    // A temporary storage outage must not prevent a user from viewing photos.
  }
  return metrics(ctx);
}

async function saveMetrics(ctx: Ctx, user: UserMetrics): Promise<void> {
  const worker = ctx as Ctx & DurableRecordContext;
  const namespace = worker.env?.CHAT_DO;
  if (!namespace) return;
  try {
    const id = ctx.from?.id ?? ctx.chat?.id ?? 0;
    await namespace.get(namespace.idFromName(`chat:${id}`)).fetch(
      `https://do/record/${encodeURIComponent(`trendy-photo-user:${id}`)}`,
      { method: "PUT", body: JSON.stringify(user) },
    );
  } catch {
    // The request still works; the following request starts with fresh metrics.
  }
}

function requestKeyboard(topic: TopicId) {
  return inlineKeyboard([
    [inlineButton("Ещё по этой теме", `more:${topic}`)],
    [inlineButton("К темам", "menu:main")],
  ]);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

async function fetchPhotos(topic: Topic, page: number): Promise<PhotoItem[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: topic.search,
    gsrlimit: "16",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1280",
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 400);
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      signal: controller.signal,
      headers: { "accept": "application/json" },
    });
    if (!response.ok) return [];
    const body = await response.json() as { query?: { pages?: Array<{ imageinfo?: Array<{ thumburl?: string; url?: string; extmetadata?: Record<string, { value?: string }> }> }> } };
    const candidates = (body.query?.pages ?? [])
      .map((item) => item.imageinfo?.[0])
      .filter((item): item is NonNullable<typeof item> => Boolean(item?.thumburl || item?.url))
      .map((item) => ({
        url: item.thumburl ?? item.url ?? "",
        attribution: stripHtml(item.extmetadata?.Artist?.value ?? item.extmetadata?.Credit?.value ?? "Wikimedia Commons"),
        license: stripHtml(item.extmetadata?.LicenseShortName?.value ?? "лицензия указана на Wikimedia Commons"),
      }))
      .filter((item) => item.url.startsWith("https://"));
    const offset = (page * 4) % Math.max(candidates.length, 1);
    return [...candidates.slice(offset), ...candidates.slice(0, offset)].slice(0, 4);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function showPhotos(ctx: Ctx, topic: Topic): Promise<void> {
  const user = await loadMetrics(ctx);
  const current = now();
  if (!consumeDailyRequest(user, current)) {
    await ctx.reply("Вы уже использовали 30 подборок сегодня. Новые фотографии будут доступны завтра.");
    return;
  }
  user.current_topic = topic.id;
  await saveMetrics(ctx, user);
  await ctx.replyWithChatAction("upload_photo");
  const photos = await fetchPhotos(topic, user.page);
  if (photos.length < 4) {
    await ctx.reply("Не удалось подобрать четыре фото сейчас. Попробуйте ещё раз чуть позже.", {
      reply_markup: requestKeyboard(topic.id),
    });
    return;
  }
  const caption = `Источник: ${photos[0].attribution || "Wikimedia Commons"}\nЛицензия: ${photos[0].license}`.slice(0, 1024);
  const media = photos.map((photo, index) => ({
    type: "photo" as const,
    media: photo.url,
    ...(index === 0 ? { caption } : {}),
  }));
  await ctx.replyWithMediaGroup(media);
  user.page += 1;
  await saveMetrics(ctx, user);
  await ctx.reply(`Ещё фотографии по теме «${topic.name}».`, { reply_markup: requestKeyboard(topic.id) });
}

composer.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith("topic:") && !data.startsWith("more:")) return next();
  await ctx.answerCallbackQuery();
  const requested = data === "topic:random"
    ? TOPICS[Math.floor((now().getTime() / 86_400_000) % TOPICS.length)]
    : topicById(data.split(":")[1] ?? "");
  if (!requested) {
    await ctx.reply("Эта тема больше недоступна. Выберите другую из меню.");
    return;
  }
  if (data.startsWith("topic:")) {
    const user = await loadMetrics(ctx);
    user.page = 0;
    await saveMetrics(ctx, user);
  }
  await showPhotos(ctx, requested);
});

export default composer;
