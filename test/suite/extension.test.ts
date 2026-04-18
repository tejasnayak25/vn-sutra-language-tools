import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";

suite("VN-Sutra Extension", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("local.vnsutra-language-tools");
    assert.ok(extension, "Extension should be available in test host.");
    await extension?.activate();
  });

  test("No diagnostics for valid fixture", async () => {
    const doc = await openFixture("valid.vn");
    const diagnostics = await waitForDiagnostics(doc.uri, (all) => all.length >= 0);
    const severe = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(severe.length, 0, "Valid fixture should not produce error diagnostics.");
  });

  test("Expected diagnostics for invalid fixture", async () => {
    const doc = await openFixture("invalid.vn");
    const diagnostics = await waitForDiagnostics(doc.uri, (all) => all.length >= 2);
    const messages = diagnostics.map((d) => d.message);

    assert.ok(
      messages.some((m) => m.includes("Choice option must be inside a > choice block.")),
      "Should report orphan choice option"
    );
    assert.ok(
      messages.some((m) => m.includes("else: is not aligned with a matching if block.")),
      "Should report orphan else"
    );
  });

  test("Completion includes scene names after jump", async () => {
    const content = "[scene: start]\njump: s";
    const doc = await vscode.workspace.openTextDocument({ language: "vn", content });
    await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(1, 7);
    const result = (await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      position
    )) as vscode.CompletionList;

    const labels = result.items.map((i) => i.label.toString());
    assert.ok(labels.includes("start"), "Completion list should include scene name 'start'.");
  });

  test("Completion includes variables after dollar", async () => {
    const content = "[scene: start]\n$name = \"Alice\"\nmary: Hi $";
    const doc = await vscode.workspace.openTextDocument({ language: "vn", content });
    await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(2, 10);
    const result = (await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      position,
      "$"
    )) as vscode.CompletionList;

    const labels = result.items.map((i) => i.label.toString());
    assert.ok(labels.includes("$name"), "Completion list should include variable '$name'.");
  });

  test("Completion includes context keys for @actor.call", async () => {
    const content = "[scene: start]\n@actor.call ";
    const doc = await vscode.workspace.openTextDocument({ language: "vn", content });
    await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(1, 12);
    const result = (await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      position,
      " "
    )) as vscode.CompletionList;

    const labels = result.items.map((i) => i.label.toString());
    assert.ok(labels.includes("actor="), "Completion list should include action key 'actor='.");
    assert.ok(labels.includes("method="), "Completion list should include action key 'method='.");
    assert.ok(labels.includes("args="), "Completion list should include action key 'args='.");
  });

  test("Completion includes scene names for scene= key", async () => {
    const content = "[scene: start]\n[scene: next]\n@dialog scene=s";
    const doc = await vscode.workspace.openTextDocument({ language: "vn", content });
    await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(2, 15);
    const result = (await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      position,
      "="
    )) as vscode.CompletionList;

    const labels = result.items.map((i) => i.label.toString());
    assert.ok(labels.includes("start"), "Completion list should include scene name 'start'.");
    assert.ok(labels.includes("next"), "Completion list should include scene name 'next'.");
  });

  test("Completion includes assets for asset= key", async () => {
    const content = "[scene: start]\nbg: futon_room\n@background asset=f";
    const doc = await vscode.workspace.openTextDocument({ language: "vn", content });
    await vscode.window.showTextDocument(doc);

    const position = new vscode.Position(2, 20);
    const result = (await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      position,
      "="
    )) as vscode.CompletionList;

    const labels = result.items.map((i) => i.label.toString());
    assert.ok(labels.includes("futon_room"), "Completion list should include known asset name.");
  });

  test("Lint warns for non-4-space indentation", async () => {
    const content = "[scene: start]\nif $name === \"A\":\n  mary: two-space indent\nend";
    const doc = await vscode.workspace.openTextDocument({ language: "vn", content });
    await vscode.window.showTextDocument(doc);

    const diagnostics = await waitForDiagnostics(doc.uri, (all) => all.length > 0);
    const messages = diagnostics.map((d) => d.message);
    assert.ok(
      messages.some((m) => m.includes("Indentation should use multiples of 4 spaces.")),
      "Should warn on non-4-space indentation."
    );
  });

  test("Lint errors for malformed case under switch", async () => {
    const content = "[scene: start]\nswitch $route:\ncase \"A\":\n    mary: bad indent\nend";
    const doc = await vscode.workspace.openTextDocument({ language: "vn", content });
    await vscode.window.showTextDocument(doc);

    const diagnostics = await waitForDiagnostics(doc.uri, (all) => all.length > 0);
    const messages = diagnostics.map((d) => d.message);
    assert.ok(
      messages.some(
        (m) =>
          m.includes("case/default must be indented deeper than its switch line.") ||
          m.includes("case/default used outside of a switch block.")
      ),
      "Should report invalid case placement under switch."
    );
  });
});

async function openFixture(fileName: string): Promise<vscode.TextDocument> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    throw new Error("Workspace root not available in test host.");
  }
  const filePath = path.join(root, "test", "fixtures", fileName);
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  return doc;
}

async function waitForDiagnostics(
  uri: vscode.Uri,
  done: (diagnostics: vscode.Diagnostic[]) => boolean,
  timeoutMs = 5000
): Promise<vscode.Diagnostic[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (done(diagnostics)) {
      return diagnostics;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return vscode.languages.getDiagnostics(uri);
}
