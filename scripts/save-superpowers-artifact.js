#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const VALID_KINDS = new Set(['spec', 'plan']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function assertArtifactInput({ kind, slug, content, projectDir, date }) {
  if (!VALID_KINDS.has(kind)) {
    throw new Error('kind must be "spec" or "plan"');
  }
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw new Error('slug must contain only lowercase letters, numbers, and hyphens');
  }
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('content must be a non-empty string');
  }
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    throw new Error('projectDir must be a non-empty string');
  }
  if (!DATE_RE.test(date)) {
    throw new Error('date must use YYYY-MM-DD format');
  }
}

async function rejectSymlinkFile(targetPath) {
  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      throw new Error('refuses to overwrite symlink artifact file');
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function saveSuperpowersArtifact(input) {
  const kind = input.kind;
  const slug = input.slug;
  const content = input.content;
  const projectDir = input.projectDir;
  const date = input.date || today();
  const dryRun = Boolean(input.dryRun);

  assertArtifactInput({ kind, slug, content, projectDir, date });

  const projectRoot = await fs.realpath(projectDir);
  const superpowersDir = path.join(projectRoot, 'docs', 'superpowers');
  const subdir = kind === 'spec' ? 'specs' : 'plans';
  const filename = kind === 'spec' ? `${date}-${slug}-design.md` : `${date}-${slug}.md`;
  const targetDir = path.join(superpowersDir, subdir);
  const targetPath = path.join(targetDir, filename);

  await fs.mkdir(targetDir, { recursive: true });

  const realSuperpowersDir = await fs.realpath(superpowersDir);
  if (realSuperpowersDir !== superpowersDir) {
    throw new Error('refuses to write outside docs/superpowers');
  }

  const realTargetDir = await fs.realpath(targetDir);
  if (!isInside(realSuperpowersDir, realTargetDir)) {
    throw new Error('refuses to write outside docs/superpowers');
  }

  await rejectSymlinkFile(targetPath);

  if (!dryRun) {
    await fs.writeFile(targetPath, content, 'utf8');
  }

  return {
    path: targetPath,
    relativePath: path.relative(projectRoot, targetPath),
    written: !dryRun,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`unexpected argument: ${arg}`);
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(`missing value for ${arg}`);
    }
    args[key] = value;
    index += 1;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let content = args.content;
  if (args.contentFile) {
    content = await fs.readFile(args.contentFile, 'utf8');
  }
  if (content === undefined) {
    content = await readStdin();
  }

  const result = await saveSuperpowersArtifact({
    kind: args.kind,
    slug: args.slug,
    content,
    projectDir: args.projectDir || process.cwd(),
    date: args.date,
    dryRun: args.dryRun,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
