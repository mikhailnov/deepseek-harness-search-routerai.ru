# @local/dsh-web-search-routerai

Веб-поиск через [RouterAI](https://routerai.ru) для DeepSeek Harness: регистрирует
провайдера `routerai` в `ctx.web`, поэтому встроенный инструмент `web_search`
работает без учётной записи DeepSeek — плата списывается с баланса RouterAI.

Настройка и список проверенных моделей и движков — в
[docs/DETAIL.md](docs/DETAIL.md).

Установка: **Plugins → Add plugin** → выбрать этот каталог (или
`plugin_manager action: install_bundle`).

Совместим с DSH ≥ 0.2. Лицензия распространения не назначается (частный
плагин); иконка оригинальная.
