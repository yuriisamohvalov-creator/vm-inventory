## Bulk import: требования к файлу импорта

Файлом импорта является **JSON-файл**. Его загружается в UI на странице `Администрирование` (карточка “Массовый импорт”).

### 1) Общий формат

Верхний уровень — **JSON-объект**:

```json
{
  "departments": [],
  "streams": [],
  "info_systems": [],
  "vms": []
}
```

Все ключи **опциональны**. Можно передать только часть (например, только `vms`, если дерево `Department -> Stream -> InfoSystem` уже заведено).

### 2) Поведение импорта

Импорт выполняет **create/update (merge)**:
- Департаменты/стримы/ИС и ВМ создаются, если их ещё нет.
- Для существующих ВМ обновляются поля по `fqdn`.
- Удаления (в смысле “если в файле нет сущности — удалить её из БД”) **не выполняются**.

При ошибках на уровне отдельных элементов импорт продолжается и возвращает список `errors` в результате.

### 3) Структура `departments`

Массив объектов:

```json
{
  "name": "Department name",
  "short_name": "D1",
  "cpu_quota": 0,
  "ram_quota": 0,
  "disk_quota": 0,
  "streams": [
    {
      "name": "Stream name",
      "info_systems": [
        { "name": "IS name", "code": "IS_CODE", "is_id": "IS_ID" }
      ]
    }
  ]
}
```

Обязательное поле: `name`.

### 4) Структура `streams` (опционально)

Если не передавать `streams` вложенно внутри `departments`, можно передать отдельным ключом `streams`:

```json
{
  "name": "Stream name",
  "department_id": 1
  // или:
  "department": { "name": "Department name", "short_name": "D1", "cpu_quota": 0, "ram_quota": 0, "disk_quota": 0 },
  "info_systems": [
    { "name": "IS name", "code": "IS_CODE", "is_id": "IS_ID" }
  ]
}
```

Обязательные поля: `name` и один из вариантов привязки департамента (`department_id` или `department`).

### 5) Структура `info_systems` (опционально)

Если не передавать `info_systems` вложенно, можно передать отдельно массивом `info_systems`:

```json
{
  "name": "IS name",
  "stream_id": 10
  // или:
  "stream": {
    "name": "Stream name",
    "department_id": 1
    // или:
    "department": { "name": "Department name", "short_name": "D1", "cpu_quota": 0, "ram_quota": 0, "disk_quota": 0 }
  },
  "code": "IS_CODE",
  "is_id": "IS_ID"
}
```

Обязательные поля: `name` и один из вариантов привязки стрима (`stream_id` или `stream`).

### 6) Структура `vms`

Массив объектов ВМ:

```json
{
  "fqdn": "vm01.example.local",
  "ip": "10.0.0.10",
  "cpu": 2,
  "ram": 8,
  "disk": 200,
  "instance": 1,
  "os_tag": "LINUX",
  "tags": ["LINUX", "IGNORED_OR_CAN_BE_EMPTY", "CUSTOM_TAG_1", "CUSTOM_TAG_2"],

  // Привязка к ИС (выберите ОДИН способ)
  "info_system_id": 123,
  // или:
  "info_system": {
    "name": "IS name",
    "code": "IS_CODE",
    "is_id": "IS_ID",
    "stream": {
      "name": "Stream name",
      "department": { "name": "Department name", "short_name": "D1" }
    }
  }
  // или:
  "stream_id": 10,
  "info_system_name": "IS name",
  "code": "IS_CODE",
  "is_id": "IS_ID"
}
```

Обязательное поле: `fqdn`.

Опциональные поля и значения по умолчанию:
- `ip` — по умолчанию `"000.000.000.000"`
- `cpu` — по умолчанию `1`
- `ram` — по умолчанию `1`
- `disk` — по умолчанию `10`
- `instance` — по умолчанию `1` (а также ограничивается диапазоном `1..20`)

Привязка ВМ к ИС:
- `info_system_id` — привязка к уже существующей ИС по `id`.
- `info_system` — вложенная структура по именам (если сущности не найдены, создаются).
- `stream_id + info_system_name` — ИС создаётся/находится внутри заданного стрима.

Теги ВМ:
- Если передан `tags` как массив и `tags.length >= 1`, то `tags[0]` используется как ОС (`LINUX/WINDOWS/MACOS`).
- Вторая позиция (индекс `1`) **не используется из файла**: она формируется автоматически из `info_system.code`.
- Пользовательские теги берутся из `tags[2..]`.
- Если `tags` не передан, можно использовать только `os_tag` (тогда кастомные теги не добавятся).

### 7) Минимальный пример файла

```json
{
  "departments": [
    {
      "name": "IT",
      "short_name": "IT",
      "cpu_quota": 0,
      "ram_quota": 0,
      "disk_quota": 0,
      "streams": [
        {
          "name": "Prod",
          "info_systems": [
            { "name": "CRM", "code": "CRM_CODE", "is_id": "CRM-001" }
          ]
        }
      ]
    }
  ],
  "vms": [
    {
      "fqdn": "vm01.example.local",
      "ip": "10.0.0.10",
      "cpu": 2,
      "ram": 8,
      "disk": 200,
      "instance": 1,
      "os_tag": "LINUX",
      "info_system": {
        "name": "CRM",
        "code": "CRM_CODE",
        "stream": {
          "name": "Prod",
          "department": { "name": "IT", "short_name": "IT" }
        }
      },
      "tags": ["LINUX", "", "JENKINS", "PROD"]
    }
  ]
}
```

