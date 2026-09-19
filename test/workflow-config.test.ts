import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workflow configuration", () => {
  it("deploy workflow has no main-branch push trigger and always uploads for its entry points", () => {
    const deployWorkflow = readFileSync(
      new URL("../.github/workflows/deploy.yml", import.meta.url),
      "utf8",
    );

    expect(deployWorkflow).not.toMatch(/push:\s*\n\s*branches:\s*\n\s*-\s*main/m);
    expect(deployWorkflow).toContain("workflow_call:");
    expect(deployWorkflow).toContain("uses: actions/upload-pages-artifact@v3");
    expect(deployWorkflow).toContain("uses: actions/deploy-pages@v4");
    // Caller-context: do not gate upload/deploy on event_name == workflow_call
    expect(deployWorkflow).not.toContain("github.event_name == 'workflow_call'");
  });

  it("versioning workflow keeps PR runs as dry-runs and calls deploy after publishing", () => {
    const versioningWorkflow = readFileSync(
      new URL("../.github/workflows/versioning.yml", import.meta.url),
      "utf8",
    );

    expect(versioningWorkflow).toContain("if: github.event_name == 'pull_request'");
    expect(versioningWorkflow).toContain("if: >-");
    expect(versioningWorkflow).toContain("github.event_name == 'push' &&");
    expect(versioningWorkflow).toContain("uses: ./.github/workflows/deploy.yml");
    expect(versioningWorkflow).toContain("needs.version.outputs.published == 'true'");
  });

  it("wiki workflow syncs only docs/wiki to the GitHub wiki and supports manual runs", () => {
    const wikiWorkflow = readFileSync(
      new URL("../.github/workflows/wiki.yml", import.meta.url),
      "utf8",
    );

    expect(wikiWorkflow).toContain("name: Sync documentation to Wiki");
    expect(wikiWorkflow).toContain("workflow_dispatch:");
    expect(wikiWorkflow).toContain("docs/wiki/**");
    expect(wikiWorkflow).toContain("path: docs/wiki/");
    expect(wikiWorkflow).toContain("uses: Andrew-Chen-Wang/github-wiki-action@v5");
    expect(wikiWorkflow).toMatch(/concurrency:\r?\n\s*group: wiki-sync/);
    expect(wikiWorkflow).toMatch(/permissions:\r?\n\s*contents: write/);
  });
});
