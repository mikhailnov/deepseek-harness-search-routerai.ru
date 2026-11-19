/**
 * Клиентская половина бандла: страница настроек плагина «Веб-поиск RouterAI»
 * в менеджере плагинов (слот plugins.row.config). Рисует форму настройки
 * API-ключа, модели, движка и параметров поиска; сохранение идёт через
 * Host-владельца страницы (props.form.mutate) с ревизией.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-web-search-routerai',
  factory(require) {
    const React = require('react')
    const { useState } = React
    const h = React.createElement

    const ROW_KEY = '@local/dsh-web-search-routerai#web-search-routerai'

    /** Проверенные модели веб-поиска (см. index.js и docs/DETAIL.md). */
    const MODELS = [
      ['google/gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite — дешёвая, цитаты (native)'],
      ['google/gemini-3-flash-preview', 'Gemini 3 Flash Preview (native)'],
      ['google/gemini-3.6-flash', 'Gemini 3.6 Flash (native)'],
      ['openai/gpt-4.1-mini', 'GPT-4.1 Mini (native)'],
      ['openai/gpt-5.4-mini', 'GPT-5.4 Mini (native)'],
      ['x-ai/grok-4.20', 'Grok 4.20 — дешёвый поиск (native)'],
      ['x-ai/grok-4.6', 'Grok 4.6 — дешёвый поиск (native)'],
      ['anthropic/claude-haiku-4.5', 'Claude Haiku 4.5 — текст без аннотаций (native)'],
      ['anthropic/claude-haiku-5.5', 'Claude Haiku 5.5 (native)'],
      ['perplexity/sonar', 'Perplexity Sonar (только auto/exa)'],
      ['openai/gpt-5-nano', 'GPT-5 Nano — самая дешёвая OpenAI (exa)'],
      ['qwen/qwen3.5-9b', 'Qwen 3.5 9B — очень дешёвая (exa)'],
      ['z-ai/glm-5', 'GLM 5 — хороша по-русски (exa)'],
      ['deepseek/deepseek-v3.2', 'DeepSeek V3.2 (exa)'],
      ['yandex/aliceai-llm-flash', 'AliceAI LLM Flash — поиск бесплатно (auto)'],
    ]
    const ENGINES = [
      ['auto', 'Auto — RouterAI сам выбирает движок (рекомендуется)'],
      ['native', 'Native — нативный поиск провайдера модели'],
      ['exa', 'Exa — работает с любой моделью (~0,45 ₽ за результат)'],
    ]
    /** Диапазоны числовых полей (синхронизированы со схемой в index.js). */
    const RANGES = {
      maxResults: { min: 1, max: 20, label: 'Максимум результатов' },
      maxTokens: { min: 64, max: 8192, label: 'Лимит токенов ответа' },
      timeoutMs: { min: 5000, max: 300000, label: 'Таймаут запроса, мс' },
    }

    const css = {
      section: { display: 'grid', gap: '14px' },
      row: { display: 'grid', gap: '4px' },
      label: { fontSize: '13px', color: 'var(--dsw-alias-label-primary, inherit)', fontWeight: 600 },
      hint: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary, inherit)', margin: 0 },
      input: {
        width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: '13px',
        color: 'var(--dsw-alias-label-primary, inherit)', background: 'var(--dsw-alias-bg-base, transparent)',
        border: '1px solid var(--dsw-alias-border-l2, currentColor)', borderRadius: '6px',
      },
      buttons: { display: 'flex', gap: '8px', alignItems: 'center' },
      button: {
        padding: '6px 14px', fontSize: '13px', borderRadius: '6px', cursor: 'pointer',
        color: 'var(--dsw-alias-label-primary, inherit)', background: 'var(--dsw-alias-bg-layer-2, transparent)',
        border: '1px solid var(--dsw-alias-border-l2, currentColor)',
      },
      primary: { background: 'var(--dsw-alias-brand-primary, #2563eb)', color: '#fff', border: 'none' },
      status: { fontSize: '12px' },
      ok: { color: 'var(--dsw-alias-state-success-primary, inherit)' },
      err: { color: 'var(--dsw-alias-state-error-primary, inherit)' },
      warn: { color: 'var(--dsw-alias-state-warn-primary, inherit)' },
    }

    /**
     * Точка входа слота: решает, что рисовать, без хуков — сама форма с
     * хуками в RouterAiForm монтируется безусловно, чтобы порядок хуков
     * не менялся между рендерами.
     */
    function RouterAiSettings(props) {
      if (props.view === 'summary') return 'API-ключ, модель и движок веб-поиска RouterAI'
      if (props.form === undefined) {
        return h('p', { style: css.hint }, 'Настройки недоступны: конфигурация плагина не открыта в этом профиле.')
      }
      return h(RouterAiForm, { form: props.form })
    }

    /**
     * Форма настроек. Черновик локальный; «Сохранить» отправляет только
     * изменённые поля (set), сброс ключа и очищенный базовый URL — unset.
     */
    function RouterAiForm({ form }) {
      const snapshot = form.state
      const value = snapshot.value ?? {}
      const userLayer = snapshot.user ?? {}
      const [draft, setDraft] = useState({})
      const [saving, setSaving] = useState(false)
      const [failed, setFailed] = useState(false)
      const [saved, setSaved] = useState(false)
      const [noChanges, setNoChanges] = useState(false)
      const [invalid, setInvalid] = useState(null)
      const [keyInput, setKeyInput] = useState('')
      const [dropKey, setDropKey] = useState(false)
      const set = (name, next) => { setDraft(current => ({ ...current, [name]: next })); setSaved(false) }
      const field = (name, fallback) => (name in draft ? draft[name] : (value[name] ?? fallback))
      const resetEdits = () => { setDraft({}); setKeyInput(''); setDropKey(false); setFailed(false); setSaved(false); setNoChanges(false); setInvalid(null) }

      const keyEntered = keyInput.trim() !== ''

      const save = async () => {
        setInvalid(null)
        // Числовые поля: локальная проверка диапазонов даёт понятную ошибку
        // вместо молчаливого отказа Host-валидации.
        for (const [name, range] of Object.entries(RANGES)) {
          if (!(name in draft)) continue
          const parsed = Number(draft[name])
          if (!Number.isInteger(parsed) || parsed < range.min || parsed > range.max) {
            setInvalid(`${range.label}: целое число от ${range.min} до ${range.max}`)
            return
          }
        }
        const ops = []
        if (dropKey) ops.push({ op: 'unset', path: ['apiKey'] })
        else if (keyEntered) ops.push({ op: 'set', path: ['apiKey'], value: keyInput.trim() })
        for (const name of ['model', 'engine', 'searchPrompt']) {
          if (name in draft && draft[name] !== (value[name] ?? '')) {
            ops.push({ op: 'set', path: [name], value: String(draft[name]) })
          }
        }
        if ('baseUrl' in draft) {
          const trimmed = String(draft.baseUrl).trim()
          // Пустое поле возвращает дефолт схемы, а не пустой URL.
          if (trimmed === '') ops.push({ op: 'unset', path: ['baseUrl'] })
          else if (trimmed !== (value.baseUrl ?? '')) ops.push({ op: 'set', path: ['baseUrl'], value: trimmed })
        }
        for (const name of Object.keys(RANGES)) {
          if (!(name in draft)) continue
          const parsed = Number(draft[name])
          if (parsed !== value[name]) ops.push({ op: 'set', path: [name], value: parsed })
        }
        for (const name of ['includeDomains', 'excludeDomains']) {
          if (!(name in draft)) continue
          const list = String(draft[name]).split(',').map(s => s.trim()).filter(s => s !== '')
          if (JSON.stringify(list) !== JSON.stringify(value[name] ?? [])) {
            ops.push({ op: 'set', path: [name], value: list })
          }
        }
        if (ops.length === 0) { setNoChanges(true); return }
        setSaving(true); setFailed(false); setSaved(false); setNoChanges(false)
        try {
          const accepted = await form.mutate(ops, snapshot.revision)
          setFailed(!accepted)
          if (accepted) { setDraft({}); setKeyInput(''); setDropKey(false); setSaved(true) }
        } catch { setFailed(true) }
        setSaving(false)
      }

      const disabled = saving || !snapshot.writable || snapshot.status !== 'ready'
      if (snapshot.status === 'loading') {
        return h('p', { style: css.hint }, 'Загрузка настроек…')
      }
      if (snapshot.status === 'unavailable') {
        return h('p', { style: css.hint }, 'Настройки недоступны: конфигурация плагина не открыта в этом профиле.')
      }

      const numberInput = (name, hint) => {
        const range = RANGES[name]
        return h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: `routerai-${name}` }, range.label),
          h('input', {
            id: `routerai-${name}`, style: css.input, type: 'number', disabled,
            min: range.min, max: range.max, step: 1, value: field(name, ''),
            onChange: e => set(name, e.target.value),
          }),
          hint ? h('p', { style: css.hint }, hint) : null)
      }

      const currentModel = field('model', 'google/gemini-2.5-flash-lite')
      const modelOptions = MODELS.some(([id]) => id === currentModel)
        ? MODELS
        : [[currentModel, 'не из проверенного списка'], ...MODELS]

      return h('div', { style: css.section, 'data-routerai-settings': true },
        h('style', null, `
          [data-routerai-settings] input:disabled, [data-routerai-settings] select:disabled { opacity: .5 }
          [data-routerai-settings] select { width: 100%; box-sizing: border-box; padding: 6px 8px; font-size: 13px;
            color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-bg-base, transparent);
            border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 6px }
        `),
        h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: 'routerai-apiKey' }, 'API-ключ RouterAI'),
          h('input', {
            id: 'routerai-apiKey', style: css.input, type: 'password', disabled,
            placeholder: 'sk-…', value: keyInput, autoComplete: 'new-password',
            onChange: e => { setKeyInput(e.target.value); setDropKey(false) },
          }),
          h('p', { style: css.hint },
            'Ключ из личного кабинета routerai.ru. Значение секрета не показывается, ',
            'но сохранение и удаление работают; после «Сохранено» плагин подхватывает ключ без перезапуска.',
          ),
          !dropKey ? h('button', {
            type: 'button', style: { ...css.button, marginTop: '4px' }, disabled,
            onClick: () => { setKeyInput(''); setDropKey(true) },
          }, 'Удалить сохранённый ключ') : null,
          dropKey ? h('p', { style: css.hint }, 'Ключ будет удалён при сохранении; если ключ не задан, ничего не изменится.') : null),
        h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: 'routerai-model' }, 'Модель поиска'),
          h('select', {
            id: 'routerai-model', style: css.input, disabled,
            value: currentModel,
            onChange: e => set('model', e.target.value),
          }, modelOptions.map(([id, label]) => h('option', { key: id, value: id }, `${id} — ${label}`))),
          h('p', { style: css.hint }, 'Только модели, проверенные с веб-поиском RouterAI. Дешевле всего: Qwen 3.5 9B или GPT-5 Nano с движком exa.')),
        h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: 'routerai-engine' }, 'Движок поиска'),
          h('select', {
            id: 'routerai-engine', style: css.input, disabled,
            value: field('engine', 'auto'),
            onChange: e => set('engine', e.target.value),
          }, ENGINES.map(([id, label]) => h('option', { key: id, value: id }, label))),
          h('p', { style: css.hint }, 'Native поддерживают не все модели — при ошибке выберите auto или exa.')),
        h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: 'routerai-baseUrl' }, 'Базовый URL API'),
          h('input', {
            id: 'routerai-baseUrl', style: css.input, type: 'text', disabled,
            placeholder: 'https://routerai.ru/api/v1', value: field('baseUrl', ''),
            onChange: e => set('baseUrl', e.target.value),
          }),
          h('p', { style: css.hint }, 'Меняйте только для совместимого прокси. Пустое поле возвращает значение по умолчанию.')),
        numberInput('maxResults', 'От 1 до 20; влияет на стоимость (exa — за каждый результат).'),
        numberInput('maxTokens', 'Не ставьте слишком мало: у рассуждающих моделей ответ может остаться пустым.'),
        numberInput('timeoutMs', 'Вступает в силу меньшее из этого значения и таймаута инструмента web_search.'),
        h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: 'routerai-searchPrompt' }, 'Промпт для поиска (необязательно)'),
          h('input', {
            id: 'routerai-searchPrompt', style: css.input, type: 'text', disabled,
            placeholder: 'Например: Ищи актуальные и достоверные источники', value: field('searchPrompt', ''),
            onChange: e => set('searchPrompt', e.target.value),
          })),
        h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: 'routerai-includeDomains' }, 'Только домены (через запятую)'),
          h('input', {
            id: 'routerai-includeDomains', style: css.input, type: 'text', disabled,
            placeholder: 'например: wikipedia.org, cbr.ru',
            value: (draft.includeDomains !== undefined)
              ? draft.includeDomains
              : (value.includeDomains ?? []).join(', '),
            onChange: e => set('includeDomains', e.target.value),
          })),
        h('div', { style: css.row },
          h('label', { style: css.label, htmlFor: 'routerai-excludeDomains' }, 'Исключить домены (через запятую)'),
          h('input', {
            id: 'routerai-excludeDomains', style: css.input, type: 'text', disabled,
            value: (draft.excludeDomains !== undefined)
              ? draft.excludeDomains
              : (value.excludeDomains ?? []).join(', '),
            onChange: e => set('excludeDomains', e.target.value),
          })),
        h('div', { style: css.buttons },
          h('button', { type: 'button', style: { ...css.button, ...css.primary }, disabled, onClick: save },
            saving ? 'Сохранение…' : 'Сохранить'),
          h('button', { type: 'button', style: css.button, disabled, onClick: resetEdits }, 'Отменить изменения'),
          h('span', { role: 'status', 'aria-live': 'polite', style: css.status },
            invalid ? h('span', { style: css.err }, invalid)
              : failed ? h('span', { style: css.err }, 'Сохранение не удалось — проверьте значения.')
                : saved ? h('span', { style: css.ok }, 'Сохранено.')
                  : noChanges ? h('span', { style: css.hint }, 'Нет изменений.')
                    : null),
          !snapshot.writable ? h('span', { style: { ...css.status, ...css.warn } }, 'Профиль только для чтения.') : null),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          id: 'web-search-routerai',
          key: ROW_KEY,
          order: 10,
        }, RouterAiSettings))
      },
    }
  },
})
