// Checks every example workflow against the action's current interface, so an
// example cannot drift from action.yml: each one must use the action, pass only
// inputs it declares and read only outputs it sets.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const actionRef = "michielvha/kustomize-build-check-action@";

type Step = { id?: string; uses?: string; with?: Record<string, unknown> };
type Job = { steps?: Step[] };

function parseYaml(path: string): any {
  const parsed = Bun.YAML.parse(readFileSync(path, "utf8"));
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`${path} is not a YAML mapping`);
  }
  return parsed;
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const action = parseYaml(join(root, "action.yml"));
const inputs = new Set(Object.keys(action.inputs ?? {}));
const outputs = new Set(Object.keys(action.outputs ?? {}));

const examplesDir = join(root, "examples");
const scenarios = readdirSync(examplesDir).filter((name) =>
  statSync(join(examplesDir, name)).isDirectory(),
);

test("action.yml declares inputs and outputs", () => {
  expect(inputs.size).toBeGreaterThan(0);
  expect(outputs.size).toBeGreaterThan(0);
});

test("examples/ holds only scenario folders", () => {
  const stray = readdirSync(examplesDir).filter((name) => !scenarios.includes(name));
  expect(stray).toEqual([]);
  expect(scenarios.length).toBeGreaterThan(0);
});

for (const scenario of scenarios) {
  describe(scenario, () => {
    const dir = join(examplesDir, scenario);
    const files = readdirSync(dir);

    test("contains only workflow files", () => {
      expect(files.length).toBeGreaterThan(0);
      expect(files.filter((name) => !/\.ya?ml$/.test(name))).toEqual([]);
    });

    const workflows = files.filter((name) => /\.ya?ml$/.test(name));
    const actionSteps = workflows.flatMap((file) => {
      const jobs: Record<string, Job> = parseYaml(join(dir, file)).jobs ?? {};
      return Object.entries(jobs).flatMap(([jobName, job]) =>
        (job.steps ?? [])
          .filter((step) => step.uses?.startsWith(actionRef))
          .map((step) => ({ where: `${file} job ${jobName}`, job, step })),
      );
    });

    test("uses the action", () => {
      expect(actionSteps.length).toBeGreaterThan(0);
    });

    for (const { where, job, step } of actionSteps) {
      test(`${where} passes only declared inputs`, () => {
        const unknown = Object.keys(step.with ?? {}).filter((name) => !inputs.has(name));
        expect(unknown).toEqual([]);
      });

      if (step.id) {
        test(`${where} reads only declared outputs of step ${step.id}`, () => {
          const pattern = new RegExp(
            `steps\\.${escapeRegExp(step.id!)}\\.outputs\\.([A-Za-z0-9_-]+)`,
            "g",
          );
          const read = strings(job).flatMap((text) =>
            [...text.matchAll(pattern)].map((match) => match[1]),
          );
          expect(read.filter((name) => !outputs.has(name))).toEqual([]);
        });
      }
    }
  });
}
