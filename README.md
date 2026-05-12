# @zerobias-org/context-util

Higher-level context utilities that sit logically above `org/util`'s build
infrastructure:

- **`@zerobias-org/util-collector`** — HTTP fetching, data chunking,
  CSV/YAML parsing helpers used by collector bots.
- **`@zerobias-org/data-utils`** — schema generation, validation, type
  mapping, JSONata transforms, and the `DataProducerClient`.

These packages live in their own repo because they depend on
`@zerobias-org/hub-sdk-interface-dataproducer` and
`@zerobias-org/module-interface-dataproducer`, which in turn depend on
`@zerobias-org/util-connector` (published from `org/util`). Keeping
`collector` and `data-utils` here lets `org/util` publish without waiting
on the interface packages, and lets us bump the interface packages
without re-publishing the whole util monorepo.

## Build / test / gate

```bash
zbb gate     # full pipeline (lint → compile → transpile → test)
zbb build
zbb test
```

Driven by the same monorepo Gradle plugins as `org/util` — see
`build.gradle.kts` and `settings.gradle.kts`.
