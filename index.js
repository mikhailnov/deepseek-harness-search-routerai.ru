/**
 * Веб-поиск через RouterAI (https://routerai.ru) для DeepSeek Harness.
 *
 * Регистрирует провайдера `routerai` в службе `ctx.web`, поэтому инструмент
 * `web_search` harness начинает работать без учётной записи DeepSeek: запрос
 * уходит в RouterAI Chat Completions с плагином `web`, а ответ (текст и
 * цитаты `url_citation`) нормализуется в `WebSearchResult`.
 *
 * Настройки (API-ключ, модель, движок поиска и его параметры) редактируются
 * на странице плагина в менеджере плагинов DSH.
 * @module @local/dsh-web-search-routerai
 */

// Вендорные копии @deepseek-ai/schemastery 3.19.0 и @deepseek-ai/cosmokit
// (обе MIT): плагин самодостаточен и не зависит от установки пакетов в профиле DSH.
import z from './vendor/node_modules/@deepseek-ai/schemastery/lib/index.mjs'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-routerai'

/** Служба web, в которую регистрируется провайдер поиска, и таймер периодической синхронизации служебного поля. */
export const inject = ['web', 'timer']

const DEFAULT_BASE_URL = 'https://routerai.ru/api/v1'
/**
 * Таймаут по умолчанию не выше 60 с: базовая композиция DSH ограничивает
 * инструмент web_search значением `tool-web` `searchTimeoutMs` (60 000 мс),
 * и раньше срабатывает меньшее из двух пределов.
 */
const DEFAULT_TIMEOUT_MS = 60000

/**
 * Модели, проверенные с веб-поиском RouterAI 2026-11-18. Движок `native`
 * поддерживают только провайдеры с собственным поиском (OpenAI, Google,
 * xAI, Anthropic); движок `exa` работает с любой моделью, `auto` выбирает
 * подходящий сам. Цены за запрос поиска: OpenAI/Anthropic ~1,07–1,23 ₽,
 * Google ~1,5 ₽, xAI ~0,53 ₽, Exa ~0,45 ₽ за результат, AliceAI ~0,05 ₽
 * (ответ-конспект без ссылок).
 */
const SEARCH_MODELS = [
  ['google/gemini-2.5-flash-lite', 'Google Gemini 2.5 Flash Lite — недорогая, со ссылками (native)'],
  ['google/gemini-3-flash-preview', 'Google Gemini 3 Flash Preview — быстрая, со ссылками (native)'],
  ['google/gemini-3.6-flash', 'Google Gemini 3.6 Flash — новая Flash-модель (native)'],
  ['openai/gpt-4.1-mini', 'OpenAI GPT-4.1 Mini — недорогая, подробные ссылки (native)'],
  ['openai/gpt-5.4-mini', 'OpenAI GPT-5.4 Mini — быстрая, со ссылками (native)'],
  ['x-ai/grok-4.20', 'xAI Grok 4.20 — дешёвый поиск, ~0,5 ₽ за запрос (native)'],
  ['x-ai/grok-4.6', 'xAI Grok 4.6 — дешёвый поиск (native)'],
  ['anthropic/claude-haiku-4.5', 'Anthropic Claude Haiku 4.5 — ответ текстом, без ссылок (native)'],
  ['anthropic/claude-haiku-5.5', 'Anthropic Claude Haiku 5.5 — недорогая (native)'],
  ['perplexity/sonar', 'Perplexity Sonar — только движок auto или exa, не native'],
  ['openai/gpt-5-nano', 'OpenAI GPT-5 Nano — самая недорогая у OpenAI (exa)'],
  ['qwen/qwen3.5-9b', 'Qwen 3.5 9B — очень недорогая (exa)'],
  ['z-ai/glm-5', 'Z.ai GLM 5 — хороша с русским языком (exa)'],
  ['deepseek/deepseek-v3.2', 'DeepSeek V3.2 — недорогая (exa)'],
  ['yandex/aliceai-llm-flash', 'Яндекс AliceAI LLM Flash — ~0,05 ₽ за запрос, ответ-конспект без ссылок (auto)'],
]

const modelChoices = SEARCH_MODELS.map(([value, description]) => z.const(value).description(description))

/**
 * Конфигурация плагина; редактируется в менеджере плагинов DSH. Все поля
 * volatile: страница настроек показывает только такие поля, значения
 * применяются без перезапуска плагина и читаются через `.get()` в момент
 * запроса.
 */
export const Config = z.object({
  apiKey: z.string().role('secret').volatile().description('API-ключ RouterAI из личного кабинета https://routerai.ru. Без ключа провайдер неактивен и инструмент web_search не предлагается модели.'),
  baseUrl: z.string().volatile().description('Базовый URL API RouterAI. Меняйте только для совместимого прокси.').default(DEFAULT_BASE_URL),
  model: z.union(modelChoices).volatile().description('Модель, которой RouterAI выполняет поиск и сводит результаты. Дешевле всего: Qwen 3.5 9B и GPT-5 Nano с движком exa; Gemini 2.5 Flash Lite — дешёвый вариант с нативным поиском.').default('google/gemini-2.5-flash-lite'),
  engine: z.union([
    z.const('auto').description('Auto — RouterAI сам выбирает движок (рекомендуется)'),
    z.const('native').description('Native — нативный поиск провайдера модели (OpenAI, Google, xAI, Anthropic, Perplexity)'),
    z.const('exa').description('Exa — поиск Exa, работает с любой моделью (~0,45 ₽ за результат)'),
  ]).volatile().description('Поисковый движок RouterAI. Native не поддерживает все модели — при ошибке выберите auto или exa.').default('auto'),
  maxResults: z.number().step(1).min(1).max(20).volatile().description('Максимум результатов поиска в одном запросе.').default(5),
  maxTokens: z.number().step(1).min(64).max(8192).volatile().description('Лимит токенов ответа модели. Не ставьте слишком мало: у рассуждающих моделей ответ может остаться пустым.').default(1024),
  searchPrompt: z.string().volatile().description('Необязательный системный промпт для поисковых запросов (например, «Ищи актуальные и достоверные источники»).').default(''),
  includeDomains: z.array(z.string()).volatile().description('Ограничить поиск только этими доменами (например, wikipedia.org). Поддерживаются подстановочные знаки; совместимость зависит от движка.').default([]),
  excludeDomains: z.array(z.string()).volatile().description('Исключить эти домены из результатов. Совместимость зависит от движка.').default([]),
  timeoutMs: z.number().step(1).min(5000).max(300000).volatile().description('Таймаут одного поискового запроса, мс.').default(DEFAULT_TIMEOUT_MS),
  /**
   * Служебное поле: плагин поддерживает его сам, а страница настроек
   * показывает по нему, задан ли API-ключ (слои значений редактируют
   * секреты, поэтому присутствие ключа иначе в форму не попадает).
   */
  apiKeyIsSet: z.boolean().volatile().description('Поддерживается плагином автоматически: задан ли API-ключ. Вручную не меняйте.').default(false),
})

/**
 * Разобрать ответ RouterAI в WebSearchResult: текст ответа — в content,
 * аннотации url_citation — в sources (приводится к общему виду, дубли URL
 * отбрасываются, выдержка обрезается до длины, пригодной для отображения).
 * @param {any} data - тело ответа /chat/completions.
 * @returns {{ content: string, sources: Array<{url:string,title?:string,snippet?:string}>, truncated: false }}
 */
function toSearchResult(data) {
  const SNIPPET_LIMIT = 300
  const message = data?.choices?.[0]?.message ?? {}
  const content = typeof message.content === 'string' ? message.content.trim() : ''
  const seen = new Set()
  const sources = []
  for (const annotation of message.annotations ?? []) {
    if (annotation?.type !== 'url_citation') continue
    const citation = annotation.url_citation ?? {}
    if (typeof citation.url !== 'string' || citation.url.length === 0 || seen.has(citation.url)) continue
    seen.add(citation.url)
    const snippet = typeof citation.content === 'string' ? citation.content.slice(0, SNIPPET_LIMIT) : undefined
    sources.push({
      url: citation.url,
      ...(typeof citation.title === 'string' && citation.title.length > 0 ? { title: citation.title } : {}),
      ...(snippet !== undefined && snippet.length > 0 ? { snippet } : {}),
    })
  }
  return { content, sources, truncated: false }
}

/**
 * Описание ошибки RouterAI: сообщение об ошибке API, если оно есть, иначе
 * краткая сводка по HTTP-статусу и телу.
 * @param {number} status - HTTP-статус ответа.
 * @param {string} body - тело ответа.
 * @returns {string} Текст ошибки для модели и пользователя.
 */
function describeFailure(status, body) {
  try {
    const parsed = JSON.parse(body)
    const message = parsed?.error?.message ?? parsed?.message
    if (typeof message === 'string' && message.length > 0) {
      return `RouterAI web search failed (HTTP ${status}): ${message}`
    }
  } catch { /* Тело не JSON — используем сводку ниже. */ }
  return `RouterAI web search failed (HTTP ${status}): ${body.slice(0, 300)}`
}

/**
 * Зарегистрировать провайдера поиска `routerai` в `ctx.web`.
 * @param {import('@deepseek-ai/cordis').Context} ctx - контекст плагина.
 * @param {Record<string, { get(): any }>} config - конфигурация: все поля volatile,
 *   поэтому значения читаются аксессорами `.get()` в момент запроса и меняются без перезапуска.
 */
export function apply(ctx, config) {
  const apiKeyOf = () => {
    const key = config.apiKey.get()?.trim()
    return key ? key : undefined
  }

  /**
   * Держать служебное поле apiKeyIsSet равным наличию ключа: форма настроек
   * читает его из значений конфигурации (сами значения секрета редактируются,
   * поэтому присутствие ключа иначе в форму не попадает). Запись идёт через
   * редактор конфигурации; при недоступном редакторе повтор попытки —
   * на следующем такте интервала.
   */
  const syncKeyMirror = () => {
    const entry = ctx.fiber?.entry
    const editor = ctx.get('configEditor')
    if (entry === undefined || editor === undefined) return
    if (config.apiKeyIsSet.get() === (apiKeyOf() !== undefined)) return
    editor.edit(entry, current => ({ ...current, apiKeyIsSet: apiKeyOf() !== undefined }))
      .catch(() => { /* Профиль без записи: повторим на следующем такте. */ })
  }
  syncKeyMirror()
  ctx.effect(() => ctx.timer.interval(syncKeyMirror, 5000))

  ctx.web.registerSearchProvider({
    id: 'routerai',
    title: 'RouterAI',
    description: {
      en: 'Web search through the RouterAI API (https://routerai.ru) with a selectable model and engine (auto / native / exa). Paid per request on the RouterAI balance.',
      ru: 'Веб-поиск через API RouterAI (https://routerai.ru) с выбором модели и движка (auto / native / exa). Плата за запросы списывается с баланса RouterAI.',
    },
    available: () => apiKeyOf() !== undefined,
    ready: async () => apiKeyOf() !== undefined,
    search: async (request, signal) => {
      const apiKey = apiKeyOf()
      if (apiKey === undefined) throw new Error('RouterAI web search is not configured: set the API key in the plugin settings (Plugins → Веб-поиск RouterAI).')
      // Пустая строка в конфиге равносильна отсутствию значения.
      const configuredBase = config.baseUrl.get()?.trim()
      const baseUrl = (configuredBase || DEFAULT_BASE_URL).replace(/\/+$/, '')
      const model = config.model.get()
      const engine = config.engine.get()
      const maxResults = request.maxResults ?? config.maxResults.get()
      const maxTokens = config.maxTokens.get()
      const searchPrompt = config.searchPrompt.get()
      const includeDomains = config.includeDomains.get() ?? []
      const excludeDomains = config.excludeDomains.get() ?? []
      const timeoutMs = config.timeoutMs.get()

      const webPlugin = { id: 'web', max_results: maxResults, engine }
      if (includeDomains.length > 0) webPlugin.include_domains = includeDomains
      if (excludeDomains.length > 0) webPlugin.exclude_domains = excludeDomains

      const messages = [
        {
          role: 'system',
          content: `Ты — поисковый ассистент. Ответь на запрос пользователя по результатам веб-поиска: кратко (до 200 слов), по-русски (если запрос не на русском — на языке запроса), только проверенные по источникам факты. Не добавляй пояснений о своей работе.${searchPrompt ? ` ${searchPrompt}` : ''}`,
        },
        { role: 'user', content: request.query },
      ]

      const timeout = AbortSignal.timeout(timeoutMs)
      let response
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            plugins: [webPlugin],
            messages,
            max_tokens: maxTokens,
          }),
          signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
          // Ключ уходит только на настроенный эндпоинт: редиректы не следуются.
          redirect: 'error',
        })
      } catch (error) {
        // Собственный таймаут отличается от отмены вызывающей стороной: для неё
        // ошибка пробрасывается как есть, а таймаут получает объяснение.
        const timedOut = timeout.aborted === true
        if (signal?.aborted === true || !timedOut) throw error
        throw new Error(`RouterAI web search timed out after ${timeoutMs} ms; increase the timeout or pick a faster model/engine in the plugin settings.`)
      }

      let body
      try {
        body = await response.text()
      } catch (error) {
        // Чтение тела идёт под тем же таймаутом: объясняем его так же, как aborted fetch.
        if (signal?.aborted !== true && timeout.aborted === true) {
          throw new Error(`RouterAI web search timed out after ${timeoutMs} ms; increase the timeout or pick a faster model/engine in the plugin settings.`)
        }
        throw error
      }
      if (!response.ok) throw new Error(describeFailure(response.status, body))

      let data
      try {
        data = JSON.parse(body)
      } catch {
        throw new Error(`RouterAI web search returned a non-JSON response (HTTP ${response.status}): ${body.slice(0, 300)}`)
      }

      const result = toSearchResult(data)
      if (result.content.length === 0 && result.sources.length === 0) {
        throw new Error('RouterAI web search returned neither an answer nor sources; try another model or engine (auto / exa) in the plugin settings.')
      }
      return result
    },
  })
}
