import * as vscode from "vscode";

type DocumentSymbols = {
  scenes: Set<string>;
  actors: Set<string>;
  vars: Set<string>;
  assets: Set<string>;
  options: Set<string>;
};

type BlockKind = "if" | "switch" | "choice";
type BlockState = { kind: BlockKind; indent: number; line: number };

const CONTROL_KEYWORDS = ["if", "else", "switch", "case", "default", "repeat"];
const SHORTHAND_COMMANDS = [
  "jump:",
  "end",
  "bg:",
  "music play:",
  "music stop",
  "sfx:",
  "wait:",
  "actor show:",
  "actor hide:",
  "storage set:",
  "storage get:",
  "storage remove:",
  "delete",
  "transition:",
  "flash screen",
  "shake screen"
];
const GENERIC_ACTION_TYPES = [
  "@background",
  "@actor.reset",
  "@actor.set",
  "@actor.call",
  "@sprite.apply",
  "@dialog",
  "@choice",
  "@parallel",
  "@achievement"
];

const ACTION_KEYS: Record<string, string[]> = {
  "@background": ["reset=", "asset="],
  "@actor.reset": ["actor=", "fields="],
  "@actor.set": ["actor=", "props="],
  "@actor.call": ["actor=", "method=", "args="],
  "@sprite.apply": ["actor=", "sprite="],
  "@dialog": ["actor=", "text=", "params="],
  "@choice": ["var=", "message=", "options=", "multiSelect="],
  "@parallel": ["sequences="],
  "@achievement": ["id=", "amount="]
};

const TRANSITION_TYPES = ["fade", "in", "out"];

const KNOWN_LINE_MATCHERS: RegExp[] = [
  /^\s*\[\s*scene\s*:\s*[A-Za-z0-9_-]+\s*\]\s*$/i,
  /^\s*#.*$/,
  /^\s*".*"\s*$/,
  /^\s*@[A-Za-z0-9_.-]+(?:\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+)*\s*$/,
  /^\s*[A-Za-z][A-Za-z0-9_-]*\s*:\s*.+$/,
  /^\s*jump\s*:\s*[A-Za-z0-9_-]+\s*$/i,
  /^\s*end\s*$/i,
  /^\s*bg\s*:\s*[^\s].*$/i,
  /^\s*music\s+play\s*:\s*[^\s].*$/i,
  /^\s*music\s+stop\s*$/i,
  /^\s*sfx\s*:\s*[^\s].*$/i,
  /^\s*wait\s*:\s*\d+\s*$/i,
  /^\s*>\s*input\s+\$[A-Za-z_][A-Za-z0-9_]*\s*:\s*".*"\s*$/i,
  /^\s*actor\s+show\s*:\s*[A-Za-z0-9_-]+\s*$/i,
  /^\s*actor\s+hide\s*:\s*[A-Za-z0-9_-]+\s*$/i,
  /^\s*\$[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+$/,
  /^\s*\$[A-Za-z_][A-Za-z0-9_]*\s*\+=\s*.+$/,
  /^\s*\$[A-Za-z_][A-Za-z0-9_]*\s*-=\s*.+$/,
  /^\s*delete\s+\$[A-Za-z_][A-Za-z0-9_]*\s*$/i,
  /^\s*storage\s+set\s*:\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*.+$/i,
  /^\s*storage\s+get\s*:\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*\$[A-Za-z_][A-Za-z0-9_]*\s*$/i,
  /^\s*storage\s+remove\s*:\s*[A-Za-z_][A-Za-z0-9_]*\s*$/i,
  /^\s*if\s+.+:\s*$/i,
  /^\s*else\s*:\s*$/i,
  /^\s*switch\s+.+:\s*$/i,
  /^\s*case\s+.+:\s*$/i,
  /^\s*default\s*:\s*$/i,
  /^\s*repeat\s+.+:\s*$/i,
  /^\s*>\s*choice\s+\$[A-Za-z_][A-Za-z0-9_]*\s*:\s*".*"\s*$/i,
  /^\s*-\s*".+"\s*:\s*$/,
  /^\s*flash\s+screen\s+#[A-Fa-f0-9]{6}\s+\d+\s*$/,
  /^\s*shake\s+screen\s+\d+\s+\d+\s*$/,
  /^\s*transition\s*:\s*[A-Za-z0-9_-]+\s+#[A-Fa-f0-9]{6}\s+\d+\s*$/
];

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("vnsutra");

  const refreshDiagnostics = (document: vscode.TextDocument): void => {
    if (document.languageId !== "vn") {
      return;
    }
    diagnostics.set(document.uri, lintDocument(document));
  };

  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(refreshDiagnostics),
    vscode.workspace.onDidChangeTextDocument((event) => refreshDiagnostics(event.document)),
    vscode.workspace.onDidSaveTextDocument(refreshDiagnostics),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri))
  );

  for (const doc of vscode.workspace.textDocuments) {
    refreshDiagnostics(doc);
  }

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "vn" },
      {
        provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
          const symbols = collectDocumentSymbols(document);
          return buildCompletions(document, position, symbols);
        }
      },
      "$",
      ":",
      "@",
      "-",
      " "
    )
  );
}

export function deactivate(): void {
  // No teardown needed; subscriptions handle disposal.
}

function buildCompletions(
  document: vscode.TextDocument,
  position: vscode.Position,
  symbols: DocumentSymbols
): vscode.CompletionItem[] {
  const line = document.lineAt(position.line).text;
  const linePrefix = line.slice(0, position.character);
  const currentWord = document.getText(document.getWordRangeAtPosition(position) ?? new vscode.Range(position, position));

  const items = new Map<string, vscode.CompletionItem>();
  const push = (item: vscode.CompletionItem): void => {
    const key = `${item.kind ?? "x"}:${item.label.toString()}`;
    if (!items.has(key)) {
      items.set(key, item);
    }
  };

  for (const keyword of CONTROL_KEYWORDS) {
    const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
    item.insertText = keyword;
    item.detail = "VN control keyword";
    push(item);
  }

  for (const command of SHORTHAND_COMMANDS) {
    const item = new vscode.CompletionItem(command, vscode.CompletionItemKind.Function);
    item.insertText = command;
    item.detail = "VN shorthand command";
    push(item);
  }

  for (const action of GENERIC_ACTION_TYPES) {
    const item = new vscode.CompletionItem(action, vscode.CompletionItemKind.Method);
    item.insertText = action;
    item.detail = "VN generic @ action";
    push(item);
  }

  if (/jump\s*:\s*[A-Za-z0-9_-]*$/i.test(linePrefix)) {
    for (const sceneName of symbols.scenes) {
      const item = new vscode.CompletionItem(sceneName, vscode.CompletionItemKind.Reference);
      item.detail = "Scene";
      push(item);
    }
  }

  if (/(scene|targetScene|jump)=\s*[A-Za-z0-9_-]*$/i.test(linePrefix)) {
    for (const sceneName of symbols.scenes) {
      const item = new vscode.CompletionItem(sceneName, vscode.CompletionItemKind.Reference);
      item.detail = "Scene";
      push(item);
    }
  }

  if (/^\s*transition\s*:\s*[A-Za-z0-9_-]*$/i.test(linePrefix)) {
    for (const transitionType of TRANSITION_TYPES) {
      const item = new vscode.CompletionItem(transitionType, vscode.CompletionItemKind.EnumMember);
      item.detail = "Transition type";
      push(item);
    }
  }

  if (/multiSelect=\s*[A-Za-z]*$/i.test(linePrefix) || /\b(reset|loop|enabled)=\s*[A-Za-z]*$/i.test(linePrefix)) {
    for (const boolValue of ["true", "false"]) {
      const item = new vscode.CompletionItem(boolValue, vscode.CompletionItemKind.EnumMember);
      item.detail = "Boolean";
      push(item);
    }
  }

  if (/^\s*[A-Za-z0-9_-]*$/.test(linePrefix) && !linePrefix.includes(":")) {
    for (const actor of symbols.actors) {
      const item = new vscode.CompletionItem(actor, vscode.CompletionItemKind.Variable);
      item.insertText = `${actor}: `;
      item.detail = "Actor dialog";
      push(item);
    }
  }

  if (/^\s*actor\s+(show|hide)\s*:\s*[A-Za-z0-9_-]*$/i.test(linePrefix) || /\bactor=\s*[A-Za-z0-9_-]*$/i.test(linePrefix)) {
    for (const actor of symbols.actors) {
      const item = new vscode.CompletionItem(actor, vscode.CompletionItemKind.Variable);
      item.detail = "Actor";
      push(item);
    }
  }

  if (/^\s*bg\s*:\s*[^\s]*$/i.test(linePrefix) || /\basset=\s*[^\s]*$/i.test(linePrefix)) {
    for (const asset of symbols.assets) {
      const item = new vscode.CompletionItem(asset, vscode.CompletionItemKind.File);
      item.detail = "Asset";
      push(item);
    }
  }

  if (linePrefix.includes("$") || currentWord.startsWith("$")) {
    for (const variableName of symbols.vars) {
      const item = new vscode.CompletionItem(`$${variableName}`, vscode.CompletionItemKind.Variable);
      item.detail = "Variable";
      push(item);
    }
  }

  if (/^\s*@/.test(linePrefix)) {
    const actionMatch = linePrefix.match(/^\s*(@[A-Za-z0-9_.-]+)/);
    const action = actionMatch?.[1] ?? "";
    const contextKeys = ACTION_KEYS[action] ?? ["actor=", "asset=", "var=", "scene=", "method=", "args=", "props="];
    for (const key of contextKeys) {
      const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
      item.insertText = key;
      item.detail = "@ action key";
      push(item);
    }
  }

  if (/^\s*-\s*"[^"]*$/i.test(linePrefix)) {
    for (const option of symbols.options) {
      const item = new vscode.CompletionItem(option, vscode.CompletionItemKind.Value);
      item.insertText = `${option}\":`;
      item.detail = "Choice option";
      push(item);
    }
  }

  return [...items.values()];
}

function collectDocumentSymbols(document: vscode.TextDocument): DocumentSymbols {
  const scenes = new Set<string>();
  const actors = new Set<string>();
  const vars = new Set<string>();
  const assets = new Set<string>();
  const options = new Set<string>();

  for (let i = 0; i < document.lineCount; i += 1) {
    const line = document.lineAt(i).text;

    const sceneMatch = line.match(/^\s*\[\s*scene\s*:\s*([A-Za-z0-9_-]+)\s*\]\s*$/i);
    if (sceneMatch) {
      scenes.add(sceneMatch[1]);
    }

    const actorMatch = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*.+$/);
    if (actorMatch) {
      actors.add(actorMatch[1].toLowerCase());
    }

    const varMatches = line.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g);
    for (const match of varMatches) {
      vars.add(match[1]);
    }

    const bgMatch = line.match(/^\s*bg\s*:\s*([^\s].*)\s*$/i);
    if (bgMatch) {
      assets.add(bgMatch[1].trim());
    }

    const actionAssetMatch = line.match(/\basset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
    if (actionAssetMatch) {
      assets.add((actionAssetMatch[1] ?? actionAssetMatch[2] ?? actionAssetMatch[3]).trim());
    }

    const choiceOptionMatch = line.match(/^\s*-\s*"([^"]+)"\s*:\s*$/);
    if (choiceOptionMatch) {
      options.add(choiceOptionMatch[1]);
    }
  }

  return { scenes, actors, vars, assets, options };
}

function lintDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
  const lintUnknownLine = vscode.workspace
    .getConfiguration("vnsutra")
    .get<boolean>("lint.unknownLine", true);
  const requireSceneHeader = vscode.workspace
    .getConfiguration("vnsutra")
    .get<boolean>("lint.requireSceneHeader", true);
  const requireIndentStep = vscode.workspace
    .getConfiguration("vnsutra")
    .get<boolean>("lint.requireIndentStep", true);
  const warnTabIndent = vscode.workspace
    .getConfiguration("vnsutra")
    .get<boolean>("lint.warnTabIndent", true);

  const diagnostics: vscode.Diagnostic[] = [];
  let hasSceneHeader = false;
  const blockStack: BlockState[] = [];
  const BLOCK_STEP = 4;

  for (let i = 0; i < document.lineCount; i += 1) {
    const text = document.lineAt(i).text;
    const trimmed = text.trim();
    const indent = getIndent(text);

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (warnTabIndent && /^\s*\t+/.test(text)) {
      diagnostics.push(
        createDiagnostic(
          document,
          i,
          "Tab indentation is allowed by compiler but discouraged for consistency; prefer spaces.",
          vscode.DiagnosticSeverity.Warning
        )
      );
    }

    if (requireIndentStep && indent % BLOCK_STEP !== 0) {
      diagnostics.push(
        createDiagnostic(
          document,
          i,
          "Indentation should use multiples of 4 spaces.",
          vscode.DiagnosticSeverity.Warning
        )
      );
    }

    const sceneMatch = trimmed.match(/^\[\s*scene\s*:\s*([A-Za-z0-9_-]+)\s*\]$/i);
    if (sceneMatch) {
      hasSceneHeader = true;
      blockStack.length = 0;
      continue;
    }

    if (requireSceneHeader && !hasSceneHeader) {
      diagnostics.push(
        createDiagnostic(
          document,
          i,
          "Line appears before the first [scene: ...] header.",
          vscode.DiagnosticSeverity.Warning
        )
      );
    }

    const isElse = /^else\s*:\s*$/i.test(trimmed);
    const isCaseOrDefault = /^(case\b.+:|default:)\s*$/i.test(trimmed);
    const isChoiceOption = /^-\s*".+"\s*:\s*$/.test(trimmed);

    while (blockStack.length > 0) {
      const top = blockStack[blockStack.length - 1];
      const shouldKeepForSameIndent =
        (isElse && top.kind === "if" && indent === top.indent) ||
        (isCaseOrDefault && top.kind === "switch" && indent > top.indent) ||
        (isChoiceOption && top.kind === "choice" && indent > top.indent);

      if (indent > top.indent || shouldKeepForSameIndent) {
        break;
      }
      blockStack.pop();
    }

    if (/^if\b.+:\s*$/i.test(trimmed)) {
      validateChildIndent(document, diagnostics, i, indent, BLOCK_STEP);
      blockStack.push({ kind: "if", indent, line: i });
    }

    if (/^switch\b.+:\s*$/i.test(trimmed)) {
      validateChildIndent(document, diagnostics, i, indent, BLOCK_STEP);
      blockStack.push({ kind: "switch", indent, line: i });
    }

    if (/^>\s*choice\s+\$[A-Za-z_][A-Za-z0-9_]*\s*:\s*".*"\s*$/i.test(trimmed)) {
      validateChildIndent(document, diagnostics, i, indent, BLOCK_STEP);
      blockStack.push({ kind: "choice", indent, line: i });
    }

    if (/^repeat\b.+:\s*$/i.test(trimmed)) {
      validateChildIndent(document, diagnostics, i, indent, BLOCK_STEP);
    }

    if (isElse) {
      const ifAncestor = [...blockStack].reverse().find((entry) => entry.kind === "if" && entry.indent === indent);
      if (!ifAncestor) {
        diagnostics.push(
          createDiagnostic(
            document,
            i,
            "else: is not aligned with a matching if block.",
            vscode.DiagnosticSeverity.Error
          )
        );
      } else {
        validateChildIndent(document, diagnostics, i, indent, BLOCK_STEP);
      }
    }

    if (isCaseOrDefault) {
      const switchAncestor = [...blockStack].reverse().find((entry) => entry.kind === "switch");
      if (!switchAncestor) {
        diagnostics.push(
          createDiagnostic(
            document,
            i,
            "case/default used outside of a switch block.",
            vscode.DiagnosticSeverity.Error
          )
        );
      } else {
        if (indent <= switchAncestor.indent) {
          diagnostics.push(
            createDiagnostic(
              document,
              i,
              "case/default must be indented deeper than its switch line.",
              vscode.DiagnosticSeverity.Error
            )
          );
        }
        validateChildIndent(document, diagnostics, i, indent, BLOCK_STEP);
      }
    }

    if (isChoiceOption) {
      const choiceAncestor = [...blockStack].reverse().find((entry) => entry.kind === "choice");
      if (!choiceAncestor) {
        diagnostics.push(
          createDiagnostic(
            document,
            i,
            "Choice option must be inside a > choice block.",
            vscode.DiagnosticSeverity.Error
          )
        );
      } else {
        if (indent <= choiceAncestor.indent) {
          diagnostics.push(
            createDiagnostic(
              document,
              i,
              "Choice option must be indented deeper than the > choice line.",
              vscode.DiagnosticSeverity.Error
            )
          );
        }
        validateChildIndent(document, diagnostics, i, indent, BLOCK_STEP);
      }
    }

    if (lintUnknownLine && !KNOWN_LINE_MATCHERS.some((re) => re.test(text))) {
      diagnostics.push(
        createDiagnostic(
          document,
          i,
          "Unknown syntax line. Compiler will likely treat this as raw fallback dialog.",
          vscode.DiagnosticSeverity.Information
        )
      );
    }
  }

  return diagnostics;
}

function validateChildIndent(
  document: vscode.TextDocument,
  diagnostics: vscode.Diagnostic[],
  lineIndex: number,
  parentIndent: number,
  blockStep: number
): void {
  const child = findNextContentLine(document, lineIndex + 1);
  if (!child) {
    diagnostics.push(
      createDiagnostic(
        document,
        lineIndex,
        "Block header is missing an indented body line.",
        vscode.DiagnosticSeverity.Warning
      )
    );
    return;
  }

  if (child.indent <= parentIndent) {
    diagnostics.push(
      createDiagnostic(
        document,
        lineIndex,
        "Block body must be indented deeper than its header.",
        vscode.DiagnosticSeverity.Error
      )
    );
    return;
  }

  if (child.indent !== parentIndent + blockStep) {
    diagnostics.push(
      createDiagnostic(
        document,
        child.line,
        `Expected indentation of ${parentIndent + blockStep} spaces under this block.`,
        vscode.DiagnosticSeverity.Warning
      )
    );
  }
}

function findNextContentLine(
  document: vscode.TextDocument,
  startLine: number
): { line: number; indent: number } | undefined {
  for (let i = startLine; i < document.lineCount; i += 1) {
    const text = document.lineAt(i).text;
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    return { line: i, indent: getIndent(text) };
  }
  return undefined;
}

function getIndent(text: string): number {
  // Story compiler treats a tab as four spaces when measuring block indentation.
  const normalized = text.replace(/\t/g, "    ");
  const match = normalized.match(/^\s*/);
  return match ? match[0].length : 0;
}

function createDiagnostic(
  document: vscode.TextDocument,
  line: number,
  message: string,
  severity: vscode.DiagnosticSeverity
): vscode.Diagnostic {
  const range = document.lineAt(line).range;
  return new vscode.Diagnostic(range, message, severity);
}
