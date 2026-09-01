import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HardwareProfile {
    ramGb: number;
    cpu: string;
    logicalCores: number;
    gpu?: string;
    vramGb?: number;
}

export interface CookbookModel {
    id: string;
    name: string;
    parameterSize: string;
    minimumRamGb: number;
    minimumVramGb?: number;
    description: string;
    modelUrl: string;
}

export const COOKBOOK_MODELS: readonly CookbookModel[] = [
    { id: "qwen2.5-coder:1.5b", name: "Qwen 2.5 Coder", parameterSize: "1.5B", minimumRamGb: 4, description: "Fast code completion and small edits on modest hardware.", modelUrl: "https://ollama.com/library/qwen2.5-coder:1.5b" },
    { id: "qwen2.5-coder:3b", name: "Qwen 2.5 Coder", parameterSize: "3B", minimumRamGb: 6, description: "Compact coding assistant with a useful quality-speed balance.", modelUrl: "https://ollama.com/library/qwen2.5-coder:3b" },
    { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder", parameterSize: "7B", minimumRamGb: 10, minimumVramGb: 6, description: "General local coding model for implementation and review.", modelUrl: "https://ollama.com/library/qwen2.5-coder:7b" },
    { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2", parameterSize: "16B", minimumRamGb: 24, minimumVramGb: 12, description: "Higher-capability coding model for machines with ample memory.", modelUrl: "https://ollama.com/library/deepseek-coder-v2:16b" },
    { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder", parameterSize: "32B", minimumRamGb: 40, minimumVramGb: 24, description: "Large local coding model for high-memory workstations.", modelUrl: "https://ollama.com/library/qwen2.5-coder:32b" },
] as const;

export function recommendedModels(profile: HardwareProfile): readonly CookbookModel[] {
    return COOKBOOK_MODELS.filter((model) => model.minimumRamGb <= profile.ramGb
        && (model.minimumVramGb === undefined || profile.vramGb === undefined || model.minimumVramGb <= profile.vramGb));
}

export function cookbookModel(modelId: string): CookbookModel | undefined {
    return COOKBOOK_MODELS.find(({ id }) => id === modelId);
}

export async function inspectHardware(): Promise<HardwareProfile> {
    const profile: HardwareProfile = {
        ramGb: roundGb(os.totalmem()),
        cpu: os.cpus()[0]?.model.trim() || "Unknown CPU",
        logicalCores: os.cpus().length,
    };
    if (process.platform !== "win32") return profile;
    try {
        const { stdout } = await execFileAsync("powershell.exe", [
            "-NoProfile", "-NonInteractive", "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,AdapterRAM | ConvertTo-Json -Compress",
        ], { timeout: 5_000, windowsHide: true });
        const gpu = JSON.parse(stdout.trim()) as { Name?: string; AdapterRAM?: number };
        if (gpu.Name) profile.gpu = gpu.Name;
        if (Number.isFinite(gpu.AdapterRAM) && Number(gpu.AdapterRAM) > 0) profile.vramGb = roundGb(Number(gpu.AdapterRAM));
    } catch {
        // RAM-only recommendations remain valid when GPU telemetry is unavailable.
    }
    return profile;
}

function roundGb(bytes: number): number {
    return Math.round(bytes / 1024 ** 3 * 10) / 10;
}