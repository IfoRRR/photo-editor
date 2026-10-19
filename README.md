# Photo Editor

Браузерный редактор фотографий с локальной ретушью: сглаживанием кожи и кистью.

**Live demo:** `/photo/`

Фото обрабатывается в браузере и не отправляется на сервер.

## Возможности

- загрузка изображения в Canvas;
- работа кистью;
- сглаживание выбранных областей;
- предварительный просмотр результата;
- клиентская обработка без загрузки исходного фото на backend.

## Стек

- Vue 3
- Canvas API
- Vite
- JavaScript

## Локальный запуск

```bash
cd frontend
npm ci
npm run dev
```

Production-сборка:

```bash
npm run build
```

В общем monorepo собранный frontend отдаётся через Nginx.

## Архитектура обработки

```text
Image file → Browser memory → Canvas filters/brush → Exported image
```

Сервер не получает исходное изображение, поэтому проект подходит для демонстрации client-side обработки и базовых privacy-by-design решений.

## Что можно развить

- undo/redo через историю состояний;
- несколько слоёв;
- настройку размера и интенсивности кисти;
- crop, rotate и brightness/contrast;
- экспорт в PNG/WebP;
- тесты composables и компонентов.

## Статус

Небольшой frontend pet-project для портфолио.
