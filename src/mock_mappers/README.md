# Mock mappers (placeholder)

This folder is a placeholder. It holds the five example mappers of the mapper contract (`wippy.data:mapper_v1`, section 6), so that the demo has ready-made mappers to use. **The real home of mappers is not decided yet.** When it is, these mappers move there, and this folder goes away.

The module `wippy/dashboards` contains no mapper. It finds a mapper by its registry type, `wippy.data.mapper`, calls the mapper's function and checks what goes in and what comes out. This folder does not depend on `wippy/dashboards` either.

## The mappers

| Id | Parameters | Output |
|---|---|---|
| `mock.mappers:rows_to_frame` | `fields`: list of `{ from, name?, type, role?, unit?, additive?, nullable? }` | A frame with those columns, in that order. Rows keep their input order. |
| `mock.mappers:bucket_by_time` | `time`, `bucket` (`day`, `week`, `month`), `value` (a column or `*`), optional `group` | A series frame sorted by bucket, then by group in byte order. |
| `mock.mappers:sum_by` | `by`, `values` (columns to sum) | A category frame with one row per value of `by`, sorted by that value in byte order. |
| `mock.mappers:top_n` | `by`, `value`, `n` (1 to 100), optional `other` | A category frame with the `n` largest values, largest first. Equal values keep their input order. With `other: true`, a last row `Other` holds the sum of the rest; there is no such row when no rows remain. |
| `mock.mappers:first_row_to_record` | optional `fields` | A record built from the first row. No rows give an empty record. |

Each mapper has at least three examples, with an empty input and a tie among them. An example gives the parameters, the context, the input and the exact output.

## Rules shared by all

- A mapper is a pure function. It gets `{ rows, params, args, context = { time_zone, output } }` and returns the output, or `nil` and a message. It reads nothing else and changes nothing.
- Values: only `number` values are summed or compared. A `decimal` (a string) or a value of the wrong type gives an error that names the column.
- Empty cells (`{ ["$null"] = true }`, or a missing key) are left out of a sum and of a count of a column. `value: "*"` counts rows.
- No rows give a frame with its fields and no rows. `first_row_to_record` gives an empty record.
- With rows, a column named in the parameters that is missing from every row is an error. With no rows nothing is checked.
- Time: a date or timestamp column is bucketed in `context.time_zone`. A week starts on Monday. A bucket, a month included, is named by its first day as `YYYY-MM-DD`.
- Fields: sums and counts are `additive: true` and `nullable: false`. In `rows_to_frame`, `nullable` comes from the parameters (default `false`).
- `top_n` with `other: true` sums rows, so it reads `context.output` and refuses (`not additive`) when the output field for the value is not `additive: true`. Dashboards has no rule of its own for this.

Time zone names need the runtime's time zone database. The local Windows `wippy.exe` has none and refuses a name such as `Europe/Warsaw` (`unknown time zone`); `UTC` always works. **Conversion between named time zones is therefore not tested here.** The examples of `bucket_by_time` use `UTC` (one of them reads a timestamp with a `+01:00` offset in UTC), and the only zone check is that an unknown name gives an error. Test named zones on a runtime that has the database before relying on them.

## Self-test

`GET /api/v1/demo/mappers/selftest` returns `{ ok, mappers, points }`. Only an administrator may call it (the group `app.security:user` is denied the action `mock.mappers.selftest`). `e2e/dashboards-mappers.spec.ts` calls it. Every mapper declared in the registry, from any module, gets the generic conformance check below (`check_mappers.validate_mapper`). The mappers of this module (`mock.mappers`) also get the demo's own rules, and `mappers[].mock` says which they are. For each of them it runs:

- every `examples` entry: the function's output must equal the stated output exactly (at least three each, with an empty input and a tie);
- every `expected_failures` entry (not part of the contract's example format): a decimal value, a value of the wrong type, a column missing from every row, a missing cell in a field that is not nullable, `n` outside 1 to 100, a bucket that does not exist and so on. A case either gives an error that contains a text, or sets `params_invalid` and must be refused by `params_schema`. `valid_params` lists parameters that `params_schema` must accept (the edges of a range);
- `check_mappers.validate_mapper` of `wippy/dashboards`, the conformance check of the declaration.

For every demo point that declares a source it runs `check_mappers.validate_point`. The `points` list holds one result for each.

## Use

A point declares a source function and a mapper:

```yaml
meta:
  type: wippy.dashboards.point
  source: demo.actor:usage_by_day_rows
  mapper: mock.mappers:rows_to_frame
  mapper_params: { fields: [ ... ] }
```

An open point (`mapping: open`) lets each page choose. See `src/demo_actor/_index.yaml` (`usage_rows`) and the page `llm_calls` in `src/demo_actor/specs.lua`.
