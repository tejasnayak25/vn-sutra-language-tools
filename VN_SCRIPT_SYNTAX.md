# VN-Sutra `.vn` Script Syntax Reference

This document describes the source syntax used by the `.vn` story files in `game/story/`.

These files are compiled by [scripts/story-build.js](../scripts/story-build.js) into generated scene modules.

Use this reference when building autocomplete, snippets, syntax validation, or a language server for `.vn` files.

---

## 1) File Model

### Scene headers

Each scene starts with a header line:

```text
[scene: start]
```

Rules:

- scene names may contain letters, numbers, `_`, and `-`
- the scene header is case-insensitive for the keyword `scene`
- everything after the header belongs to that scene until the next header

### Blank lines and comments

- blank lines are ignored
- lines starting with `#` are treated as comments
- inline comments are not special; only full-line comments are skipped

### Indentation

Indented blocks are used for nested flow control:

- `if` / `else`
- `switch` / `case` / `default`
- `repeat`
- choice branches

The compiler normalizes tabs as four spaces when it measures indentation.

---

## 2) Line Kinds

The compiler reads one line at a time and maps each line to an action object.

There are three broad categories:

- shorthand commands, such as `jump: scene2`
- dialogue lines, such as `mary: Hello`
- generic action lines, such as `@actor.call actor="mary" method="slideIn"`

If a line does not match any known form, it falls back to a dialogue action using the whole line as text.

---

## 3) Dialogue Syntax

### Character dialogue

```text
mary: Hello there
```

Compiled shape:

```js
{ type: "dialog", actor: "mary", text: "Hello there" }
```

Notes:

- the actor name is lowercased by the compiler
- the text portion is trimmed after the colon

### Narration

```text
"A quiet morning begins."
```

Compiled shape:

```js
{ type: "dialog", text: "A quiet morning begins." }
```

### Raw fallback dialogue

Any unrecognized non-empty line becomes dialogue text.

This is useful as a last-resort fallback, but for tooling it should usually be flagged as a likely typo.

---

## 4) Core Shorthand Commands

### `jump`

```text
jump: scene2
```

Compiled shape:

```js
{ type: "jump", scene: "scene2" }
```

### `end`

```text
end
```

Compiled shape:

```js
{ type: "end" }
```

### Background

```text
bg: futon_room
```

Compiled shape:

```js
{ type: "background", asset: "futon_room" }
```

### Music

```text
music play: bgm_main
music stop
```

Compiled shapes:

```js
{ type: "music.play", track: "bgm_main" }
{ type: "music.stop" }
```

### Sound effect

```text
sfx: click
```

Compiled shape:

```js
{ type: "sfx.play", track: "click" }
```

### Wait

```text
wait: 1000
```

Compiled shape:

```js
{ type: "wait", duration: 1000 }
```

### Input

```text
> input $name: "What's your name?"
```

Compiled shape:

```js
{ type: "input", var: "name", message: "What's your name?" }
```

### Actor visibility

```text
actor show: mary
actor hide: mary
```

Compiled shapes:

```js
{ type: "actor.show", actor: "mary" }
{ type: "actor.hide", actor: "mary" }
```

---

## 5) Variables and Storage

### Set string variable

```text
$name = "Alice"
```

Compiled shape:

```js
{ type: "var.set", var: "name", value: "Alice" }
```

### Set numeric variable

```text
$score = 10
```

Compiled shape:

```js
{ type: "var.set", var: "score", value: 10 }
```

### Increment / decrement

```text
$score += 1
$score -= 1
```

Compiled shapes:

```js
{ type: "var.increment", var: "score", amount: 1 }
{ type: "var.decrement", var: "score", amount: 1 }
```

### Delete variable

```text
delete $temp
```

Compiled shape:

```js
{ type: "var.delete", var: "temp" }
```

### Storage set

```text
storage set: playerName = $name
```

Compiled shape:

```js
{ type: "storage.set", key: "playerName", value: { fromVar: "name" } }
```

### Storage get

```text
storage get: playerName = $loadedName
```

Compiled shape:

```js
{ type: "storage.get", key: "playerName", var: "loadedName" }
```

### Storage remove

```text
storage remove: playerName
```

Compiled shape:

```js
{ type: "storage.remove", key: "playerName" }
```

---

## 6) Flow Control

### `if` block

```text
if $name === "Peanut":
    mary: Nice to meet you
else:
    mary: Hello stranger
```

Compiled shape:

```js
{
  type: "if",
  test: { left: { fromVar: "name" }, op: "===", right: "Peanut" },
  then: [...],
  else: [...]
}
```

Supported operators in `.vn` syntax:

- `===`
- `!==`
- `>=`
- `<=`
- `>`
- `<`
- `==` becomes `===`
- `!=` becomes `!==`

### `switch` block

```text
switch $route:
    case "A":
        mary: Route A
    case "B":
        mary: Route B
    default:
        mary: Fallback
```

Compiled shape:

```js
{
  type: "switch",
  value: { fromVar: "route" },
  cases: [...],
  default: [...]
}
```

### `repeat` block

```text
repeat 3:
    mary: Looping
```

Compiled shape:

```js
{ type: "repeat", count: 3, actions: [...] }
```

You can also repeat from a variable:

```text
repeat $count:
    mary: Looping
```

### Choice shorthand

```text
> choice $route: "Pick a path"
    - "Left":
        mary: You chose left
    - "Right":
        mary: You chose right
```

Compiler behavior:

- creates a `choice` action for the prompt
- creates a matching `switch` action for the branch flow
- each `- "Option":` line adds a case option and an action block

This is the most important syntax to autocomplete well, because the choice variable and option labels are both useful completion targets.

---

## 7) Generic `@` Actions

Generic lines start with `@` and are parsed into an action object using key/value pairs.

### Syntax

```text
@action.type key=value key2="value" key3='value' key4=[1,2]
```

The action type may contain dots, underscores, hyphens, and numbers.

### Parsing rules

- values can be quoted with single or double quotes
- bare values are allowed when they contain no spaces
- numeric values are converted to numbers
- `true` and `false` become booleans
- strings starting with `[` or `{` are parsed as JSON when possible

### Examples

```text
@background reset=true asset="futon_room"
@actor.reset actor="mary" fields=["scale"]
@sprite.apply actor="mary" sprite="casualSmile"
@actor.set actor="mary" props={"x":-0.25,"y":{"portrait":0.1,"android":0.1,"default":0.1}}
@actor.call actor="mary" method="slideIn" args=[0.5,1]
@dialog actor="mary" text="@scene1.hello" params={"name":{"fromVar":"name"}}
@choice var="que1" message="What do you think?" options='["Cookie","SDK for Visual Novels"]' multiSelect=true
@parallel sequences='[[{"type":"wait","duration":100}],[{"type":"jump","scene":"scene2"}]]'
@achievement id="story.chapter-complete" amount=1
```

### Good autocomplete targets for `@` actions

- action type after `@`
- known keys for the action type
- scene names in fields like `scene`, `targetScene`, and `jump`
- actor names in `actor`
- asset names in `asset`
- variable names in `var`, `key`, `result`, and `fromVar`

---

## 8) Special Effects and Transitions

### Screen flash

```text
flash screen #ffffff 500
```

Compiled shape:

```js
{ type: "effect.flash", color: "#ffffff", duration: 500 }
```

### Screen shake

```text
shake screen 5 300
```

Compiled shape:

```js
{ type: "effect.screen-shake", intensity: 5, duration: 300 }
```

### Scene transition

```text
transition: fade #000000 250
```

Compiled shape:

```js
{ type: "scene.transition", transitionType: "fade", color: "#000000", duration: 250 }
```

The transition syntax currently maps only the transition type, color, and duration.

---

## 9) Advanced Syntax Notes

### Actor names

Actor dialogue names are lowercased by the compiler.

### JSON payloads in generic actions

For complex objects, use the generic `@` syntax with JSON literals:

```text
@actor.set actor="mary" props='{"x":0.5,"y":0.1}'
```

### Arrays in generic actions

```text
@actor.call actor="mary" method="slideIn" args='[0.5,0.8]'
```

### Fallback behavior

If a line does not match a known syntax form, the compiler emits a `dialog` action with the raw line text.

This is permissive for writing, but a language service should probably warn on it.

---

## 10) Complete Example

```text
[scene: start]
transition: fade #000000 250
@background reset=true asset="futon_room"
@actor.reset actor="mary" fields=["scale"]
mary: @scene1.hello
> input $name: "What's your name?"
storage set: playerName = $name
if $name === "Peanut":
    mary: Welcome back
else:
    mary: Nice to meet you
flash screen #ffffff 120
jump: scene2

[scene: scene2]
bg: apartment_ext
music play: theme_intro
mary: @scene2.goodbye
end
```

---

## 11) Autocomplete Priority List

If you are generating completions from this syntax, the highest-value items are:

1. scene names for `jump`, `switch`, `case` destinations, and `transition` follow-ups
2. actor names for `mary:`, `actor show:`, `actor hide:`, and `@actor.*`
3. asset names for `bg:` and `@background`
4. variable names for `$var` and `storage ... = $var`
5. action keywords for `@action.type`
6. enum values such as `fade`, `in`, `out`, `true`, `false`, and comparison operators

---

## 12) Source of Truth

This reference is based on:

- [scripts/story-build.js](../scripts/story-build.js)
- [game/story/start.vn](../game/story/start.vn)
- [game/story/scene3.vn](../game/story/scene3.vn)
