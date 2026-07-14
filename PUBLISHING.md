# Публикация в ComfyUI Registry

Шпаргалка (повторяет рабочую схему Preset Download Manager / HOTCUT).

## Один раз

1. **Создать репозиторий** на GitHub: `Smyshnikof/comfyui-storyboard-suite`, запушить код.
   Ветка должна называться `main`.

2. **Publisher + токен** на https://registry.comfy.org:
   - Publisher ID `smyshnikof` (совпадает с `pyproject.toml`);
   - создать API key (Personal Access Token).

3. **Секрет в GitHub:** `REGISTRY_ACCESS_TOKEN` = токен реестра.

## Каждая публикация

1. Поднять версию в `pyproject.toml`.
2. Запушить в `main` — workflow сработает автоматически при изменении `pyproject.toml`.

## Чек перед публикацией

- [ ] `pyproject.toml`: `name`, `PublisherId=smyshnikof`, `DisplayName=Storyboard Suite`, `Icon`, `Repository`.
- [ ] `icon.png` в корне (~400×400).
- [ ] `__init__.py`: `NODE_CLASS_MAPPINGS`, `NODE_DISPLAY_NAME_MAPPINGS`, `WEB_DIRECTORY="./web"`.
- [ ] `requirements.txt` актуален.
- [ ] Проверено в локальном ComfyUI: обе ноды грузятся, UI и выходы работают.
