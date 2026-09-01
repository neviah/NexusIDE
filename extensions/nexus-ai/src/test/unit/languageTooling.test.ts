import assert from "node:assert/strict";
import test from "node:test";
import { assessLanguageTooling, LanguageToolingInventory } from "../../languageToolingAssessment";

const ready: LanguageToolingInventory = {
    pythonRuntime: true,
    pythonExtension: true,
    pythonDebugger: true,
    dotnetSdk: true,
    csharpExtension: true,
    unityEditor: true,
    unityExtension: true,
};

test("complete language tooling inventory is ready", () => {
    assert.deepEqual(assessLanguageTooling(ready).map((item) => item.ready), [true, true, true]);
});

test("missing optional tooling always reports an actionable setup step", () => {
    const assessment = assessLanguageTooling({
        ...ready,
        pythonDebugger: false,
        dotnetSdk: false,
        unityEditor: false,
    });
    assert.deepEqual(assessment.map((item) => item.ready), [false, false, false]);
    assert.equal(assessment.every((item) => Boolean(item.action)), true);
    assert.match(assessment[0].action ?? "", /Open VSX/);
    assert.match(assessment[1].action ?? "", /.NET SDK/);
    assert.match(assessment[2].action ?? "", /Unity Hub/);
});