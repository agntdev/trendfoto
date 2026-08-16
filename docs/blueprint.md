# Trendy Photo Bot — Bot specification

**Archetype:** content

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Telegram-бот, предоставляющий бесплатные трендовые фотографии по 6 предустановленным темам (Мода, Уличная фотография, Портреты, Пейзажи, Путешествия, Технологии). Пользователь выбирает тему или вводит текст, получает подборку изображений с атрибуцией.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram-пользователи
- Русскоязычная аудитория
- Создатели контента
- Дизайнеры

## Success criteria

- Пользователь получает 4 актуальных фото по выбранной теме
- Работает пагинация 'Еще по этой теме'
- Распознаются текстовые запросы в 80% случаев

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Открывает главное меню с темами
  - inputs: Telegram user ID
  - outputs: Inline keyboard с 6 темами + 'Случайное'
- **Текстовый запрос** (command, actor: user, command: /text) — Пользователь вводит текст для поиска по темам
  - inputs: Текстовый запрос
  - outputs: Сообщение с предложенной темой или 'Нет совпадений'

## Flows

### Main menu
_Trigger:_ /start

1. Отправить приветствие
2. Отобразить inline-клавиатуру с темами

_Data touched:_ User

### Photo request
_Trigger:_ callback_data:topic_select

1. Получить тему
2. Запросить 4 фото из источника
3. Отправить альбом с атрибуцией
4. Добавить кнопки 'Еще по этой теме'

_Data touched:_ Topic, PhotoItem

### Pagination
_Trigger:_ callback_data:more_photos

1. Получить текущую тему
2. Запросить следующую порцию фото
3. Отправить альбом
4. Обновить счётчик пагинации

_Data touched:_ User

### Text query
_Trigger:_ text message

1. Анализировать текст
2. Сопоставить с темами
3. Отправить предложение или ошибку

_Data touched:_ User

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram-пользователь с метриками
  - fields: telegram_id, last_request_ts, request_count, current_topic
- **Topic** _(retention: persistent)_ — Предустановленная категория фото
  - fields: id, name, description, photo_count
- **PhotoItem** _(retention: session)_ — Изображение с метаданными
  - fields: url, source, attribution, license

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Выбор тем
- Настройка лимитов
- Изменение источника фото

## Notifications

- Сообщения об ошибках
- Уведомления о превышении лимитов

## Permissions & privacy

- Хранение только анонимных метрик
- Нет личных данных пользователей

## Edge cases

- Нет совпадений по тексту
- Превышение лимита 30 запросов/день
- Пустой ответ от источника фото

## Required tests

- Проверка работы всех 6 тем
- Тест пагинации
- Тест обработки текстовых запросов
- Тест rate-limit

## Assumptions

- Источник фото определён разработчиком
- 4 фото на запрос - оптимальный баланс
- Русский интерфейс по умолчанию
