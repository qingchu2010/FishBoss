import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { getStoragePaths } from '../storage/paths.js';

export interface PromptFile {
  name: string;
  path: string;
  content: string | null;
}

const PROMPTS_DIR = getStoragePaths().prompts;

function ensurePromptsDir(): void {
  if (!existsSync(PROMPTS_DIR)) {
    mkdirSync(PROMPTS_DIR, { recursive: true });
  }
}

function getPromptPath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(PROMPTS_DIR, `${sanitized}.md`);
}

export async function listPrompts(): Promise<PromptFile[]> {
  ensurePromptsDir();
  const files = readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const filePath = join(PROMPTS_DIR, file);
    const name = basename(file, '.md');
    let content: string | null = null;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      content = null;
    }
    return { name, path: filePath, content };
  });
}

export async function loadPrompt(name: string): Promise<string | null> {
  ensurePromptsDir();
  const filePath = getPromptPath(name);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function savePrompt(name: string, content: string): Promise<void> {
  ensurePromptsDir();
  const filePath = getPromptPath(name);
  writeFileSync(filePath, content, 'utf-8');
}

export async function deletePrompt(name: string): Promise<void> {
  ensurePromptsDir();
  const filePath = getPromptPath(name);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export async function promptExists(name: string): Promise<boolean> {
  ensurePromptsDir();
  const filePath = getPromptPath(name);
  return existsSync(filePath);
}

export async function ensureDefaultPrompts(): Promise<void> {
  ensurePromptsDir();
  
  const testPromptPath = getPromptPath('model-test');
  if (!existsSync(testPromptPath)) {
    writeFileSync(
      testPromptPath,
      'Don\'t think. We need to confirm whether the model can reply. Please respond with "success".',
      'utf-8'
    );
  }
}
