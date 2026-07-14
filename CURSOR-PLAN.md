# Storyboard Suite — что доделать (план для Cursor)

## СТАТУС 2026-07-14 (обновлено)
Сделано: ✅ P0-1 width/height, ✅ P0-2 Frame Grid (Batch), ✅ P1-3 живой пример-воркфлоу,
✅ P2-6 LICENSE, ✅ P2-7 иконка 400×400/124КБ.
Осталось: ⬜ P2-5 git init + GitHub + токен реестра, ⬜ P1-4 проверить персист (Save→F5→Load),
✅ P0.5 Storyboard Sheet собрана (для картинок из пайплайна), 🆕 **P0.7 Storyboard Cells** —
аплоад картинок прямо в ноду, ячейками (главный трек, см. низ файла). P0.6 (мульти-входы) —
опционально, если оставляешь и Sheet.

---

Обе ноды (`TextTable`, `FrameGrid`) грузятся, UI-виджеты работают
(таблица, сетка карточек, drag-sort, aspect-combo), есть fallback-парсинг строк/JSON,
`example_workflows/`, `icon.png`, GitHub Action под реестр. **Ядро готово.**

Недоделано в основном на **выходной стороне** (ноды плохо втыкаются в реальный воркфлоу)
и по **упаковке под публикацию**. Ниже — по приоритету. Каждый пункт: что не так →
что сделать → как проверить. Работаем парным программированием: Cursor пишет, ты гоняешь
в ComfyUI и возвращаешь ошибки.

---

## P0 — без этого нода бесполезна в реальном графе

### 1. Frame Grid: выдавать `width` / `height` (INT), а не только строку `aspect_ratio`
**Проблема:** сейчас выход `aspect_ratio` — это строка `"16:9"`. Её некуда воткнуть:
`EmptyLatentImage` / `EmptySD3LatentImage` хотят два INT (width, height). Юзер получает
кадр, но не может задать им разрешение — обрыв пайплайна.

**Сделать:**
- Добавить входной виджет `base_resolution` (INT, default 1024, напр. 512–2048) — «длинная сторона».
- Из `aspect` выбранного кадра + `base_resolution` считать `width` и `height`
  (кратные 8/64 — округлять вниз до /8, для SD3/Flux лучше /16).
- Добавить выходы `width` (INT), `height` (INT). `aspect_ratio` (STRING) оставить.
- Карта aspect → соотношение: 16:9, 9:16, 1:1, 4:3, 3:4 уже есть в `ASPECT_RATIOS`.

**Файлы:** `nodes.py` (класс `FrameGrid`: `INPUT_TYPES`, `RETURN_TYPES`, `RETURN_NAMES`, `run`).

**Проверка:** `FrameGrid.width/height → EmptyLatentImage`, генерится картинка правильного
соотношения; смена кадра 16:9 ↔ 9:16 меняет размеры.

### 2. Frame Grid: режим «весь сториборд», а не один кадр за раз
**Проблема:** нода отдаёт ТОЛЬКО выбранный кадр (`select`). Для «раскадровки» логично
прогнать все кадры подряд. Сейчас это не «сториборд», а «выбор одной строки».

**Сделать (выбрать подход, обсудить перед кодом):**
- **Вариант A (просто):** выход `all_prompts` (STRING, кадры через `\n` или разделитель) +
  `count`. Даёт обзор, но не батч.
- **Вариант B (по-comfy):** отдавать список — `prompt` как список строк (ComfyUI list/INPUT
  `is_list`/`OUTPUT_IS_LIST`), чтобы граф сам итерировал по кадрам за один Queue.
  Это правильный, но более тонкий путь (проверить на версии фронта).
- Оставить одиночный `select` как есть — это второй режим (превью одного кадра).

**Файлы:** `nodes.py` (`FrameGrid`). Возможно отдельная мини-нода `FrameGridIterate`.

**Проверка:** один Queue Prompt прогоняет все кадры (или отдаёт их пачкой), а не только `detail`.

---

## P1 — доверие/демо (без этого «карта-ассет» не продаёт себя)

### 3. Пример-воркфлоу сейчас мёртвый — подключить к реальной генерации
**Проблема:** `example_workflows/Storyboard Suite — prompt library + frame grid.json`
кладёт две ноды с `links: null` — они ни к чему не подключены. Юзер открывает и не видит,
ЗАЧЕМ это. Демо не демонстрирует ценность.

**Сделать:** пересобрать пример как минимальный рабочий граф:
`TextTable.prompt/negative → CLIP Text Encode → KSampler`, а `FrameGrid.width/height →
EmptyLatentImage` (после пункта 1). Чекпойнт — дефолтный SD1.5/SDXL, чтобы открывалось у всех.
Сохранить прямо из ComfyUI (Save), чтобы формат/линки были валидны.

**Проверка:** Load → Queue → рендер идёт без ручных доподключений.

### 4. Проверить персист (сохранение/перезагрузка/refresh)
**Проблема (не баг, а риск):** данные таблицы/кадров лежат в скрытых виджетах
`table_data` / `frames_data` (через `hideWidget` → `type="converted-widget"`). DOM-виджеты
идут с `serialize:false`. Надо убедиться, что скрытые STRING-виджеты РЕАЛЬНО сериализуются
в workflow JSON и восстанавливаются после F5 и после reload графа.

**Сделать:** прогнать сценарий: наполнить таблицу → Save workflow → полный refresh браузера →
Load → данные на месте. Если теряются — чинить сериализацию скрытого виджета (не полагаться
на `converted-widget`, а хранить в `node.properties` или явном сериализуемом виджете).

**Файлы:** `web/js/shared.js` (`hideWidget`), `web/js/*_widget.js` (`addDOMWidget` opts).

**Проверка:** после Save→refresh→Load строки и кадры (включая порядок после drag) сохранены.

---

## P2 — упаковка под публикацию (репо ещё не готово к пушу)

### 5. git не инициализирован
Папка — не git-репо (нет `.git`, remote пустой). Под реестр и Action нужен GitHub-репо на
ветке `main`. Шаги — в `PUBLISHING.md`. Это ручное: `git init`, коммит, создать
`Smyshnikof/comfyui-storyboard-suite`, запушить, добавить секрет `REGISTRY_ACCESS_TOKEN`.

### 6. Нет файла LICENSE
`pyproject.toml` заявляет MIT, но файла `LICENSE` в корне нет. Добавить стандартный MIT
(Egor Smyshnikov, 2026).

### 7. Иконка тяжёлая/большая
`icon.png` — 1024×1024, ~865 КБ. Реестр ждёт ~400×400. Пережать до 400×400 PNG (или ≤~100 КБ).

---

## P3 — полезное на будущее (не блокеры)

- **Референс-картинка на кадр (Frame Grid):** опциональное поле image/URL в карточке —
  тогда это визуальный сториборд, а не текстовые плашки. Выход `IMAGE` для выбранного кадра.
- **`default_aspect` → существующие кадры:** сейчас дефолт применяется только к НОВЫМ кадрам.
  Добавить кнопку «применить ко всем» или чекбокс.
- **Text Table → готовое conditioning:** опциональный выход, уже перемноженный на `weight`
  (или мини-нода-хелпер), чтобы `weight` не висел мёртвым FLOAT.
- **Select-by-name после reorder:** после drag `select` переключается на индекс; если юзер
  выбирал по имени — сохранять привязку к имени.
- **Дедуп имён:** `Duplicate` плодит `name-copy`, но выбор по имени берёт первое совпадение —
  подсветить/запретить дубли имён.

---

## Готовые промпты для Cursor (парное программирование)

> P0-1: «В nodes.py у класса FrameGrid добавь входной INT-виджет base_resolution (default 1024)
> и два выхода width, height (INT), вычисляемые из aspect выбранного кадра и base_resolution,
> округляя до кратного 8. aspect_ratio-строку оставь. Обнови RETURN_TYPES/RETURN_NAMES/run.
> Объясни в абзаце, что сделал и как проверить.»

> P1-3: «Пересобери example_workflows так, чтобы TextTable.prompt/negative шли в CLIP Text Encode,
> FrameGrid.width/height — в EmptyLatentImage, дальше KSampler + VAEDecode + SaveImage на
> дефолтном SD1.5. Валидный ComfyUI workflow JSON.»

После каждого шага: перезапусти ComfyUI, проверь, ошибку из консоли — обратно в Cursor.
Руками код не правь.

---

## 🆕 P0.5 — Storyboard Sheet (визуальная раскадровка картинками)

**Зачем:** сейчас раскадровка — текстовые плашки. Хотим то, что на референсе-скрине 2:
сетка с реальными КАДРАМИ-картинками. В ComfyUI это делается НЕ инлайн-генерацией в ноде
(так фреймворк не работает), а **сборкой уже сгенерённых IMAGE в подписанную сетку**
(contact sheet). Генерация живёт в графе (сэмплер), Sheet только компонует результат.

### Что за нода
Новый класс `StoryboardSheet` в `nodes.py`, `CATEGORY = "Storyboard"`,
display `Storyboard · Sheet`. Регистрация в `NODE_CLASS_MAPPINGS` /
`NODE_DISPLAY_NAME_MAPPINGS`.

### Входы (`INPUT_TYPES`)
- `images` (IMAGE) — батч картинок из пайплайна (типично: `FrameGridBatch → sampler →
  VAEDecode → сюда`). IMAGE в ComfyUI = тензор `[N,H,W,C]`, N кадров.
- `labels` (STRING, multiline, optional) — подписи по кадрам, по строке на кадр.
  Удобно кормить list-выход `name` из `FrameGridBatch`. Если берёшь list —
  ставь `INPUT_IS_LIST = True` и аккуратно собери `images`/`labels` обратно
  (при list-режиме ComfyUI отдаёт всё списками — продумать сборку в один тензор).
  Более простой путь на старт: `images` — обычный батч, `labels` — multiline-строка.
- `columns` (INT, default 3, min 1, max 8).
- `cell_gap` (INT, default 8) — зазор между ячейками, px.
- `bg_color` (STRING, default `#0e0e12`) — фон листа.
- `show_labels` (BOOLEAN, default True) — рисовать подпись-бар.

### Выход
- `IMAGE` — один собранный лист (тензор `[1,H,W,C]`) → в `PreviewImage` / `SaveImage`.

### Логика `run`
1. Тензор → список PIL-картинок (нормализация 0..1 → 0..255, RGB).
2. Размер ячейки = по самой крупной (или фикс. `cell_w`); каждый кадр `fit` в ячейку
   (letterbox, чтобы не искажать aspect кадра).
3. Если `show_labels` — снизу/сверху ячейки бар с подписью (PIL `ImageDraw`,
   дефолтный шрифт `ImageFont.load_default()` или забандленный TTF в `web/`/`assets/`).
4. Сетка: `columns` колонок, строк = `ceil(N/columns)`, зазор `cell_gap`, фон `bg_color`.
5. Собрать в один PIL → обратно в тензор `[1,H,W,C]`, вернуть.

### Опционально (для «вау» в ролике)
Сделать ноду `OUTPUT_NODE = True` и вернуть превью через `{"ui": {"images": [...]}}`,
чтобы лист показывался ПРЯМО в ноде (как `PreviewImage`) — визуально ближе всего к скрину 2.

### Крайние случаи
- N картинок ≠ M подписей → недостающие подписи пустые, лишние игнорить.
- Картинки разного размера → `fit` в общую ячейку.
- `columns` больше N → просто неполная последняя строка.
- Пустой вход → вернуть маленький пустой лист, не падать.

### Зависимости
PIL (Pillow) — в среде ComfyUI уже есть; `torch`/`numpy` тоже. `requirements.txt` не трогаем,
но проверь, что импортируешь `PIL` без добавления в deps (оно транзитивно есть у ComfyUI).

### Демо
В пример-воркфлоу добавить ветку: `FrameGridBatch → CLIP/KSampler/VAEDecode →
StoryboardSheet → PreviewImage`. Тогда открыл пример → Queue → видишь раскадровку картинками.

### Готовый промпт для Cursor
> «Добавь в nodes.py класс StoryboardSheet (CATEGORY="Storyboard", display "Storyboard · Sheet").
> Вход: images (IMAGE-батч), labels (STRING multiline optional), columns (INT=3),
> cell_gap (INT=8), bg_color (STRING="#0e0e12"), show_labels (BOOLEAN=True).
> Выход: IMAGE — один contact-sheet: каждый кадр letterbox-фитом в ячейку, снизу подпись
> из labels (PIL ImageFont.load_default), columns колонок, зазор cell_gap, фон bg_color.
> Конверсия IMAGE-тензор ↔ PIL корректная (0..1 float, RGB, [N,H,W,C] → [1,H,W,C]).
> Зарегистрируй в маппингах. Пустой вход не должен падать. Объясни абзацем, что сделал
> и как проверить.»

**Проверка:** батч из 3–6 кадров → на выходе один лист-сетка с картинками и подписями,
идёт в SaveImage; при N, не кратном columns, последняя строка неполная и не ломает лист.

---

## 🆕 P0.6 — Storyboard Sheet: несколько входов-«ячеек»

**Проблема:** у ноды один вход `images`. В ComfyUI в один вход можно воткнуть только ОДНУ
связь — второй `Load Image` затирает первый. Чтобы собрать лист из нескольких отдельных
картинок, юзеру приходится вручную городить цепочку `Batch Images`. Неудобно и не похоже
на «ячейки» из референса.

**Цель:** дать возможность подключить каждую картинку в свой слот — ближе к сетке-раскадровке.

### Вариант A — статические слоты (просто, без JS) ← начать с этого
- В `INPUT_TYPES` добавить в `optional`: `image_1 ... image_9` (все `("IMAGE",)`).
- Оставить существующий `images` (батч) как `optional` — обратная совместимость.
- В `run` собрать общий список: сначала кадры из `images`-батча (если подан),
  затем по порядку все непустые `image_1..image_9`. Дальше как сейчас (`_build_contact_sheet`).
- Разный размер картинок уже переживает `_fit_letterbox` — ничего не ломается.

**Файлы:** `nodes.py` (`StoryboardSheet.INPUT_TYPES`, `run`).
**Проверка:** три `Load Image` → в `image_1/2/3` → Queue → лист из 3 ячеек, порядок сохранён.

### Вариант B — динамические входы (UX как «добавь ячейку», нужен JS) ← полиш потом
- JS-патч ноды: когда подключаешь последний пустой `image_*`, снизу появляется новый пустой
  вход (как в некоторых пак-нодах, напр. по `onConnectionsChange`).
- Даёт ощущение «плюсани ещё кадр», не заставляя заранее знать число.
- Делать ПОСЛЕ варианта A и только если хочется вылизать.

**Файлы:** `web/js/` (новый патч для `StoryboardSheet` + подключить в `storyboard_suite.js`).

### Готовый промпт для Cursor (вариант A)
> «В StoryboardSheet добавь в optional входы image_1..image_9 (IMAGE) рядом с существующим
> images. В run собери итоговый список кадров: сперва кадры из images-батча (если есть),
> потом по порядку все непустые image_1..image_9, и передай в _build_contact_sheet.
> Обратная совместимость с images сохранись. Объясни абзацем и как проверить.»

### Немедленный воркэраунд (пока не собрал)
Корневая нода **Batch Images**: image1/image2 → батч → в `images` у Sheet. Больше двух —
цепочкой Batch Images. Картинки одного размера. Queue → сетка.

---

## 🆕 P0.7 — Storyboard Cells (аплоад картинок прямо в ноду)

**Решение 14.07:** отдельная НОВАЯ нода `StoryboardCells` (display `Storyboard · Cells`) —
не трогаем `StoryboardSheet` (тот для картинок ИЗ пайплайна). Cells = «загрузи картинки
прямо в ячейки, нода сама ими владеет». Максимально близко к референс-скрину 2.
Live-генерации в ячейке НЕ делаем (это против ComfyUI) — только загрузка + компоновка.

### Что переиспользуем (уже в репо, не писать заново)
- Python: `_build_contact_sheet`, `_pil_to_tensor`, `_save_sheet_preview`, `_hex_to_rgb`, `_parse_labels`.
- JS: `hideWidget`, `attachPersistHooks`, паттерн `addDOMWidget` из `text_table_widget.js` /
  `frame_grid_widget.js` (карточки, drag-reorder, скрытый JSON-виджет).

### Модель данных
Скрытый сериализуемый STRING-виджет `cells_data` = JSON-массив ячеек:
`[{ "filename": "...", "subfolder": "", "type": "input", "label": "opening" }, ...]`
(ссылки на файлы в input-папке ComfyUI, как у Load Image). Персист — через `hideWidget` +
`attachPersistHooks`, как table_data/frames_data.

### Фронтенд (`web/js/cells_widget.js` + подключить в `storyboard_suite.js`)
- DOM-виджет: сетка ячеек, число колонок из виджета `columns`.
- Пустая ячейка: кнопка «+» → выбор файла → **аплоад** и превью.
- **Аплоад:** `POST /upload/image`, multipart, поле `image`, `type=input` (как делает Load Image).
  Ответ `{name, subfolder, type}` → пишем в ячейку.
- Заполненная ячейка: превью-миниатюра (URL `/view?filename=<name>&subfolder=<sub>&type=input`),
  поле подписи `label`, крестик «удалить».
- Drag-reorder ячеек — переиспользовать логику из `frame_grid_widget.js`.
- Тулбар: «+ Add cell», «Clear», combo Ratio (визуальная подсказка соотношения ячеек),
  виджет `columns`. После любого изменения — синк в `cells_data` + `markDirty`.

### Бэкенд (`nodes.py`, класс `StoryboardCells`)
- `INPUT_TYPES`: скрытый `cells_data` (STRING, JSON), `columns` (INT=3), `cell_gap` (INT=8),
  `bg_color` (STRING="#0e0e12"), `show_labels` (BOOLEAN=True).
- `RETURN_TYPES = ("IMAGE",)`, `RETURN_NAMES = ("sheet",)`, `OUTPUT_NODE = True`.
- `run`: распарсить `cells_data` → для каждой ячейки загрузить файл из input-папки
  (`folder_paths.get_annotated_filepath(f"{filename} [{type}]")` → PIL), собрать список PIL +
  список labels → `_build_contact_sheet(...)` → `_pil_to_tensor` → `_save_sheet_preview` для
  превью в ноде. Вернуть `{"ui": {...}, "result": (tensor,)}`.
- Пустой список / битый файл — пропустить ячейку, не падать.
- Регистрация в `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS`.

### Готовый промпт для Cursor
> «Добавь ноду StoryboardCells (display "Storyboard · Cells", CATEGORY="Storyboard",
> OUTPUT_NODE). Скрытый сериализуемый виджет cells_data — JSON-массив
> {filename,subfolder,type,label}. Фронтенд web/js/cells_widget.js: DOM-сетка ячеек, в пустой
> кнопка загрузки → POST /upload/image (type=input), в заполненной превью через /view + поле
> label + удаление, drag-reorder (переиспользуй паттерн frame_grid_widget.js), columns из
> виджета, персист через hideWidget+attachPersistHooks. Подключи в storyboard_suite.js.
> В run: cells_data → загрузить каждый файл из input (folder_paths.get_annotated_filepath) в
> PIL → _build_contact_sheet → _pil_to_tensor → _save_sheet_preview, вернуть IMAGE + ui-превью.
> Битый/отсутствующий файл пропускать. Объясни абзацем и как проверить.»

**Проверка:** добавил 3 ячейки, загрузил 3 картинки, подписал → Queue → лист-сетка 3-в-ряд
с подписями и превью прямо в ноде; Save workflow → F5 → Load → ячейки и картинки на месте.

### Область (чтобы не расползлось)
- НЕ делаем: выбор модели в ячейке, кнопку Synthesize, генерацию в ячейке — это HOTCUT.
- Cells только: загрузить → подписать → разложить → отдать лист IMAGE.

---

## 🆕 P0.8 — Больше соотношений сторон

Сейчас список короткий (`16:9, 9:16, 1:1, 4:3, 3:4`). Расширить как в платных ИИ.
Пересчёт `_aspect_to_size` уже парсит любое `w:h` — менять надо ТОЛЬКО списки-дропдауны,
математику не трогать.

**Новый список (от широкого к высокому):**
`21:9, 16:9, 16:10, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 10:16, 9:16, 9:21`

**Где поменять (держать синхронно!):**
- `nodes.py` → константа `ASPECT_RATIOS`
- `web/js/frame_grid_widget.js` → константа `ASPECTS`
- `web/js/cells_widget.js` → combo Ratio (когда появится, P0.7)

**Улучшение (по желанию):** вынести список в один источник — `web/js/shared.js`
(экспорт `ASPECTS`) и импортировать в оба виджета, чтобы не дублировать. В Python оставить
свою `ASPECT_RATIOS` (Python и JS не шарят код), но следить, что значения совпадают.

**Проверка:** дропдаун показывает все соотношения; выбор `21:9` → `width/height` дают
широкий кадр; `9:21` → узкий вертикальный. Дефолт оставить `16:9`.

### Готовый промпт для Cursor
> «Расширь список соотношений сторон до 21:9,16:9,16:10,3:2,4:3,5:4,1:1,4:5,3:4,2:3,10:16,9:16,9:21
> в ASPECT_RATIOS (nodes.py) и ASPECTS (frame_grid_widget.js, и cells_widget.js если есть).
> Математику _aspect_to_size не трогай — она уже парсит любое w:h. Дефолт 16:9.»
