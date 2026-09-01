import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { requireCanonicalContainedPath, requireContainedPath, WorkspacePathError } from "../workspacePaths";

test("accepts paths at or below POSIX and Windows workspace roots", () => {
    assert.equal(requireContainedPath("/repo/src/file.ts", ["/repo"]), "/repo/src/file.ts");
    assert.equal(requireContainedPath("C:\\repo\\src\\file.ts", ["C:\\repo"]), "C:\\repo\\src\\file.ts");
    assert.equal(requireContainedPath("C:\\repo", ["C:\\repo\\"]), "C:\\repo");
});

test("rejects relative paths, traversal, and sibling-prefix paths", () => {
    for (const candidate of ["src/file.ts", "/repo/../secret.txt", "/repository/secret.txt", "C:\\repo-other\\secret.txt"]) {
        assert.throws(() => requireContainedPath(candidate, candidate.startsWith("C:") ? ["C:\\repo"] : ["/repo"]), WorkspacePathError);
    }
});

test("rejects Windows device namespace paths", () => {
    assert.throws(() => requireContainedPath("\\\\?\\C:\\repo\\file.ts", ["C:\\repo"]), WorkspacePathError);
    assert.throws(() => requireContainedPath("\\\\.\\C:\\repo\\file.ts", ["C:\\repo"]), WorkspacePathError);
    assert.throws(() => requireContainedPath("C:\\repo\\CON.txt", ["C:\\repo"]), WorkspacePathError);
    assert.throws(() => requireContainedPath("C:\\repo\\file.txt:secret", ["C:\\repo"]), WorkspacePathError);
});

test("canonical containment rejects a symlink or junction that escapes the workspace", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "nexus-path-"));
    const root = path.join(parent, "workspace");
    const outside = path.join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    await symlink(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    try {
        await assert.rejects(() => requireCanonicalContainedPath(path.join(root, "linked", "secret.txt"), [root]), WorkspacePathError);
    } finally {
        await rm(parent, { recursive: true, force: true });
    }
});