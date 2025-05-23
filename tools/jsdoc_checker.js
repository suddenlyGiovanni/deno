#!/usr/bin/env -S deno run --allow-read --allow-env --allow-sys --config=tests/config/deno.json
// Copyright 2018-2025 the Deno authors. MIT license.
import { Node, Project, ts } from "npm:ts-morph@25.0.1";
import { join, ROOT_PATH } from "./util.js";

const libs = [
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_cache.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_console.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_url.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_web.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_fetch.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_websocket.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_webstorage.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_canvas.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_crypto.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_net.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno.ns.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno.shared_globals.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno.window.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_webgpu.d.ts"),
];

const unstableLibs = [
  join(ROOT_PATH, "cli/tsc/dts/lib.deno_broadcast_channel.d.ts"),
  join(ROOT_PATH, "cli/tsc/dts/lib.deno.unstable.d.ts"),
];

const errors = [];

const project = new Project();
project.addSourceFilesAtPaths(libs);
const unstableFiles = project.addSourceFilesAtPaths(unstableLibs);

for (const file of project.getSourceFiles()) {
  for (
    const node of file.getDescendants().filter((descendant) =>
      Node.isExportable(descendant)
    )
  ) {
    if (
      node.getKind() === ts.SyntaxKind.ModuleDeclaration &&
      node.getName() === "Deno"
    ) {
      continue;
    }

    const parent = node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
    const isInterfaceOrType =
      node.getKind() === ts.SyntaxKind.InterfaceDeclaration ||
      node.getKind() === ts.SyntaxKind.TypeAliasDeclaration;

    if (parent) {
      if (!node.isExported() && !isBrandVarStmt(node)) {
        errors.push(getMissingErrorPrefix(node) + "export keyword");
        continue;
      }
    } else if (!isInterfaceOrType && !node.hasDeclareKeyword()) {
      errors.push(getMissingErrorPrefix(node) + "declare keyword");
      continue;
    } else if (isInterfaceOrType && node.hasDeclareKeyword()) {
      errors.push(getErrorPrefix(node) + "has incorrect declare keyword");
      continue;
    }

    const jsDoc = node.getFirstChildIfKind(ts.SyntaxKind.JSDoc);
    if (!jsDoc) {
      errors.push(getMissingErrorPrefix(node) + "JSDoc comment");
      continue;
    }

    const tags = jsDoc.getTags();

    if (!tags.find((tag) => tag.getTagName() === "category")) {
      errors.push(getMissingErrorPrefix(node) + "JSDoc @category tag");
      continue;
    }

    if (unstableFiles.includes(file)) {
      if (!tags.find((tag) => tag.getTagName() === "experimental")) {
        errors.push(getMissingErrorPrefix(node) + "JSDoc @experimental tag");
      }
    }
  }
}

if (errors.length > 0) {
  throw new AggregateError(errors);
}

function isBrandVarStmt(node) {
  // this variable statement is intentionally private
  return Node.isVariableStatement(node) &&
    node.getDeclarations()[0].getName() === "brand";
}

function getMissingErrorPrefix(node) {
  return getErrorPrefix(node) + `is missing a `;
}

function getErrorPrefix(node) {
  return `Symbol at file://${node.getSourceFile().getFilePath()}:${node.getStartLineNumber()} `;
}
